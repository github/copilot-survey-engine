/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const dedent = require("dedent");
const fs = require("fs");
const parse = require("csv-parse/lib/sync");
const sql = require("mssql");
require("dotenv").config();

module.exports = (app) => {
  // Your code here
  app.log.info("Yay, the app was loaded!");

  app.on("pull_request.closed", async (context) => {

    let pr_number = context.payload.pull_request.number;
    let detectedLanguage = "en";
    let pr_author = context.payload.pull_request.user.login;
    let organization_name = context.payload.repository.owner.login

    // read file that aligns with detected language
    const issue_body = fs.readFileSync(
      "./issue_template/copilot-usage-" +
      detectedLanguage +
      ".md",
      "utf-8"
    );

    // find XXX in file and replace with pr_number
    let fileContent = dedent(
      issue_body.replace(/XXX/g, "#" + pr_number.toString())
    );

    // display the body for the issue
    app.log.info(fileContent);
    
    // create an issue using fileContent as body if pr_author is included in copilotSeats
    try {
      await context.octokit.issues.create({
        owner: organization_name,
        repo: context.payload.repository.name,
        title: "Copilot Usage - PR#" + pr_number.toString(),
        body: fileContent,
        assignee: pr_author,
      });
    } catch (err) {
      app.log.error(err);
    }
  });

  app.on("issues.edited", async (context) => {
    if (context.payload.issue.title.startsWith("Copilot Usage - PR#")) {
      await insertIntoFile(context);
    }
  });

  app.on("issue_comment.created", async (context) => {
    if (context.payload.issue.title.startsWith("Copilot Usage - PR#")) {
      await insertIntoFile(context);
    }
  });

  async function GetSurveyData(context) {
    let issue_body = context.payload.issue.body;
    let issue_id = context.payload.issue.id;

    // save comment body if present
    let comment = null;
    if(context.payload.comment) {
      comment = context.payload.comment.body;
    }

    // find regex [0-9]\+ in issue_body and get first result
    let pr_number = issue_body.match(/[0-9]+/)[0];

    // find regex \[x\] in issue_body and get complete line in an array
    let checkboxes = issue_body.match(/\[x\].*/g);

    // find if checkboxes array contains Sim o Si or Yes
    let isCopilotUsed = checkboxes.some((checkbox) => {
      return (
        checkbox.includes("Sim") ||
        checkbox.includes("Si") ||
        checkbox.includes("Yes") ||
        checkbox.includes("Oui")
      );
    });

    // if there's a comment, insert it into the DB regardless of whether the user answered the survey or not
    if (comment) {
      await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null, null, comment);
    }

    if (isCopilotUsed) {
      await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null, null, comment);

      // loop through checkboxes and find the one that contains %
      let pctSelected = false;
      let pctValue = new Array();
      for (const checkbox of checkboxes) {
        if (checkbox.includes("%")) {
          pctSelected = true;
          copilotPercentage = checkbox;
          copilotPercentage = copilotPercentage.replace(/\[x\] /g, "");
          pctValue.push(copilotPercentage);
          app.log.info(copilotPercentage);
        }
      }
      if (pctSelected) {
        //if percentage is selected, insert into DB
        await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, pctValue, null, comment);
      }

      // loop through checkboxes and find the ones that do not contain % and are not Yes or No
      let freqSelected = false;
      let freqValue = new Array();
      for (const checkbox of checkboxes) {
        if (
          !checkbox.includes("%") &&
          !checkbox.includes("Sim") &&
          !checkbox.includes("Si") &&
          !checkbox.includes("Yes") &&
          !checkbox.includes("Oui") &&
          !checkbox.includes("Não") &&
          !checkbox.includes("No") &&
          !checkbox.includes("Non")
        ) {
          freqSelected = true;
          frequencyValue = checkbox;
          frequencyValue = frequencyValue.replace(/\[x\] /g, "");
          freqValue.push(frequencyValue);
          app.log.info(frequencyValue);
        }
      }

      if (freqSelected) {
        //if frequency is selected, insert into DB
        await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null, freqValue, comment);
      }

      if( pctSelected && freqSelected ){
        // close the issue
        try {
          await context.octokit.issues.update({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            state: "closed",
          });
        } catch (err) {
          app.log.error(err);
        }
      }
    } else {
      if (
        checkboxes.some((checkbox) => {
          return (
            checkbox.includes("Não") ||
            checkbox.includes("No") ||
            checkbox.includes("Non")
          );
        })
      ) {
        await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null, null, comment);

        if (comment) {
          try {
            // close the issue
            await context.octokit.issues.update({
              owner: context.payload.repository.owner.login,
              repo: context.payload.repository.name,
              issue_number: context.payload.issue.number,
              state: "closed",
            });
          } catch (err) {
            app.log.error(err);
          }
        }
      }
    }

    return {
      enterprise_name: context.payload.enterprise ? context.payload.enterprise.name : '',
      organization_name: context.payload.organization ? context.payload.organization.login : '',
      repository_name: context.payload.repository ? context.payload.repository.name : '',
      issue_id: context.payload.issue ? context.payload.issue.id : '',
      issue_number: context.payload.issue ? context.payload.issue.number : '',
      PR_number: context.payload.pull_request ? context.payload.pull_request.number : '',
      assignee_name: context.payload.issue.assignee ? context.payload.issue.assignee.login : '',
      is_copilot_used: isCopilotUsed ? 1 : 0,
      saving_percentage: pctValue || '',
      usage_frequency: freqValue || '',
      comment: comment || '',
      created_at: context.payload.issue ? context.payload.issue.created_at : '',
      completed_at: context.payload.issue ? context.payload.issue.updated_at : ''
    }

  }

  async function insertIntoFile(context) {
      try {
        // Try to get the file
        let file = await context.octokit.repos.getContent({
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          path: "results.csv",
        });
        // If the file exists, get its contents
        let fileContents = Buffer.from(file.data.content, "base64").toString();
        // If the file contents are not empty, parse the CSV
        if (fileContents.length > 0) {
          // parse a csv into an array
          let result = parse(fileContents, {
            columns: true,
            skip_empty_lines: true,
          });
          app.log.info(result);
        }

        //check if the issue_id already exists in the array
        let issue_id_index = result.findIndex((row) => {
          return row.issue_id == issue_id;
        });

        if(issue_id_index != -1){
          // if the issue_id exists, update the row in the array
          result[issue_id_index] = GetSurveyData(context);
        }else{
          // if the issue_id does not exist, push the row into the array
          result.push(GetSurveyData(context));
        }

        // convert the array back into a csv
        let csv = parse(result, { header: true });
        // convert the csv into a string
        let csvString = csv.join("\n");
        // convert the string into a buffer
        let csvBuffer = Buffer.from(csvString, "utf8");
        // encode the buffer into base64
        let csvEncoded = csvBuffer.toString("base64");

        // commit the file to the repo
        await context.octokit.repos.createOrUpdateFileContents({
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          path: "results.csv",
          message: 'update',
          content: csvEncoded,
          sha: file.data.sha,
        });

      } catch (error) {
        // If the file does not exist, create it
        if (error.status === 404) {
          await context.octokit.repos.createOrUpdateFileContents({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: "results.csv",
            message: 'initial commit',
            content: 'enterprise_name, organization_name, repository_name, issue_id, issue_number, PR_number, assignee_name, is_copilot_used, saving_percentage, usage_frequency, comment, created_at, completed_at\n' + GetSurveyData(context)
          });
        } else {
          // If the error is not a 404 (not found), log it
          app.log.error(error);
        }
      }

  }

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
