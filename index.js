/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const dedent = require('dedent');
const fs = require('fs');
const path = require("path");

const issue_body = fs.readFileSync('./issue_template/copilot-usage-spa.md', 'utf-8');

module.exports = (app) => {
  // Your code here
  app.log.info("Yay, the app was loaded!");

  app.on("pull_request.closed", async (context) => {
    let pr_number = context.payload.pull_request.number;

    // find XXX in file and replace with pr_number
    let fileContent = dedent(issue_body.replace(/XXX/g, '#'+pr_number.toString()) );
    
    // display the body for the issue
    app.log.info(fileContent);

    // create an issue using fileContent as body
    await context.octokit.issues.create({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      title: "Copilot Usage",
      body: fileContent,
    });
  });

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
