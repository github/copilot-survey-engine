/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const dedent = require("dedent");
const fs = require("fs");
const csvParser = require("csv-parser");
const stream = require('stream');
const BranchName = "copilot-survey-engine-results";
require("dotenv").config();

module.exports = (app) => {
  // Your code here
  app.log.info("Yay, the app was loaded!");

  app.on("pull_request.closed", async (context) => {

    let pr_number = context.payload.pull_request.number;
    let pr_author = context.payload.pull_request.user.login;
    let organization_name = context.payload.repository.owner.login;
    let detectedLanguage = "en";

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

    // save comment body if present
    let comment = null;
    if(context.payload.comment) {
      comment = context.payload.comment.body.replace(/\n/g, ' ').trim();
    }

    // find regex [0-9]\+ in issue_body and get first result
    let pr_number = issue_body.match(/[0-9]+/)[0];

    // Get answers to first question and find if they contain affirmative answer
    let firstQuestionResponse = await getQuestionResponse(1, 2, issue_body);
    let isCopilotUsed = firstQuestionResponse.some((response) => {
      return (
        response.includes("Sim") ||
        response.includes("Si") ||
        response.includes("Yes") ||
        response.includes("Oui")
      );
    });

    // Get answers to second question and store in pctValue
    let pctValue = await getQuestionResponse(2, 3, issue_body);
    let freqValue = await getQuestionResponse(4, 5, issue_body);
    let savingsInvestedValue = await getQuestionResponse(6, '', issue_body);

    if( isCopilotUsed && pctValue && freqValue && savingsInvestedValue){
      // All questions have been answered and we can close the issue
      app.log.info("Closing the issue");
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
    
    if (
      firstQuestionResponse.some((response) => {
        return (
          response.includes("Não") ||
          response.includes("No") ||
          response.includes("Non")
        );
      })
    ){
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
    
    let data = {
      enterprise_name: context.payload.enterprise ? context.payload.enterprise.name : '',
      organization_name: context.payload.organization ? context.payload.organization.login : '',
      repository_name: context.payload.repository ? context.payload.repository.name : '',
      issue_id: context.payload.issue ? context.payload.issue.id : '',
      issue_number: context.payload.issue ? context.payload.issue.number : '',
      PR_number: pr_number || '',
      assignee_name: context.payload.issue.assignee ? context.payload.issue.assignee.login : '',
      is_copilot_used: isCopilotUsed ? 1 : 0,
      saving_percentage: pctValue ? pctValue.join(" || ") : '',
      frequency: freqValue ? freqValue.join(" || ") : '',
      savings_invested: savingsInvestedValue ? savingsInvestedValue.join(" || ") : '',
      comment: comment || '',
      created_at: context.payload.issue ? context.payload.issue.created_at : '',
      completed_at: context.payload.issue ? context.payload.issue.updated_at : ''
    };

    return data;

  }

  async function insertIntoFile(context) {
      let newContent = "";
      let resultString = "";
      let results = [];

      try {

        newContent = await GetSurveyData(context);

        // Try to get the file
        let file = await context.octokit.repos.getContent({
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          path: "results.csv",
          ref: BranchName,
        });

        // If the file exists, get its contents
        let fileContents = Buffer.from(file.data.content, "base64").toString();
        // If the file contents are not empty, parse the CSV
        if (fileContents.length > 0) {
          app.log.info("Starting to parse the CSV file...");
          // create a readable stream
          let readableStream = new stream.Readable();
          readableStream.push(fileContents);
          readableStream.push(null); 

          await new Promise((resolve, reject) => {
            readableStream
              .pipe(csvParser())
              .on('data', (data) => results.push(data))
              .on('end', () => {
                app.log.info(results);
                resolve();
              })
              .on('error', reject);
          });


          //check if the issue_id already exists in the array
          let issue_id_index = results.findIndex((row) => {
            return parseInt(row.issue_id) == parseInt(context.payload.issue.id);
          });

          if(issue_id_index != -1){
            // save previous comments
            if (results[issue_id_index].comment) {
              newContent.comment = results[issue_id_index].comment + ' || ' + newContent.comment;
            }

            // if the issue_id exists, update the row in the array results
            results[issue_id_index] = newContent;
          }else{
            // if the issue_id does not exist, push the row into the array
            results.push(newContent);
          }

          resultString = Object.keys(results[0]).join(',') + '\n'; 
          results.forEach((row) => {
            resultString += Object.values(row).join(',') + '\n'; 
          });

          app.log.info("CSV String:\n" + resultString);

          // Commit the file to the repo in a new branch
          await createBranch(context);
          await context.octokit.repos.createOrUpdateFileContents({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: "results.csv",
            message: 'Update results.csv',
            content: Buffer.from(resultString).toString('base64'),
            sha: file.data.sha,
            branch: BranchName,
          });

          app.log.info("File updated successfully\n " + Buffer.from(resultString).toString('base64'));

        }
      } catch (error) {
        // If the file does not exist, create it
        if (error.status === 404) {
          let completeData = 'enterprise_name,organization_name,repository_name,issue_id,issue_number,PR_number,assignee_name,is_copilot_used,saving_percentage,usage_frequency,savings_invested,comment,created_at,completed_at\n' 
                              + Object.values(newContent).join(',');
          await createBranch(context);
          await context.octokit.repos.createOrUpdateFileContents({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: "results.csv",
            message: 'initial commit',
            content: Buffer.from(completeData).toString('base64'),
            branch: BranchName,
          });
        } else {
          app.log.error(error);
        }
      }

  }

  async function createBranch(context) {
    // Step 1: Get reference to the default branch
    let RefBranch = null;
    try {
      // Try to get the 'main' branch
      RefBranch = await context.octokit.git.getRef({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        ref: 'heads/main',
      });
    } catch (error) {
      // If 'main' branch does not exist, try to get the 'master' branch
      if (error.status === 404) {
        RefBranch = await context.octokit.git.getRef({
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          ref: 'heads/master',
        });
      } else {
        app.log.error(error);
      }
    }

    // Step 2: Create a new branch from the default branch
    try {
      await context.octokit.git.createRef({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        ref: `refs/heads/${BranchName}`,
        sha: RefBranch.data.object.sha,
      });
    } catch (error) {
      if (error.status === 422) {
        app.log.info(`Branch ${BranchName} already exists`);
      } else {
        app.log.error(error);
      }
    }
  }

  async function getQuestionResponse(start, end, issue_body) {
    app.log.info("Getting answers for question " + start + " to " + end);
    let AnswerSelected = false;
    let Answers = new Array();
    let Expression = end ? new RegExp(start + "\\. (.*" + end + "\\." + ")?", "s") : new RegExp(start + "\\. (.*" + ")?", "s");
    let QuestionOptions = issue_body.match(Expression)[0].match(/\[x\].*/g);
    if(QuestionOptions){
      AnswerSelected = true;
      QuestionOptions.forEach((option) => {
        let cleanAnswer = option;
        cleanAnswer = cleanAnswer.replace(/\[x\] /g, "");
        Answers.push(cleanAnswer);
      });
    }
    return AnswerSelected ? Answers : null;
  }

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
