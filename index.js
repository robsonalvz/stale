const yaml = require('js-yaml');
const createScheduler = require('probot-scheduler');
const Stale = require('./lib/stale');

module.exports = async robot => {
  // Visit all repositories to mark and sweep stale issues
  const scheduler = createScheduler(robot);

  // Unmark stale issues if a user comments
  robot.on('issue_comment', unmark);
  robot.on('issues', unmark);
  robot.on('pull_request', unmark);
  robot.on('pull_request_review', unmark);
  robot.on('pull_request_review_comment', unmark);
  robot.on('schedule.repository', markAndSweep);

  async function unmark(event, context) {
    if (!context.isBot) {
      const stale = await forRepository(context);
      let issue = event.payload.issue || event.payload.pull_request;

      // Some payloads don't include labels
      if (!issue.labels) {
        issue = (await context.github.issues.get(context.issue())).data;
      }

      const staleLabelAdded = event.payload.action === 'labeled' &&
        event.payload.label.name === stale.config.staleLabel;

      if (stale.hasStaleLabel(issue) && issue.state !== 'closed' && !staleLabelAdded) {
        stale.unmark(issue);
      }
    }
  }

  async function markAndSweep(context) {
    const stale = await forRepository(context);
    if (stale.config.perform) {
      return stale.markAndSweep();
    }
  }

  async function forRepository(context) {
    const {owner, repo} = context.repo();
    const path = '.github/stale.yml';
    let config;

    try {
      const res = await context.github.repos.getContent({owner, repo, path});
      config = yaml.safeLoad(new Buffer(res.data.content, 'base64').toString()) || {};
    } catch (err) {
      scheduler.stop(context.payload.repository);
      // Don't actually perform for repository without a config
      config = {perform: false};
    }

    config = Object.assign(config, {owner, repo, logger: robot.log});

    return new Stale(context.github, config);
  }
};
