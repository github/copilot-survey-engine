const nock = require("nock");
// Requiring our app implementation
const myProbotApp = require("..");
const { Probot, ProbotOctokit } = require("probot");
// Requiring our fixtures
const payload_pr_closed = require("./fixtures/pull_request.closed.json");
const payload_issues_edited = require("./fixtures/issues.edited.json");
const issue_comment_created = require("./fixtures/issue_comment.created.json");
const fs = require("fs");
const path = require("path");

const issue_body = fs.readFileSync(
  path.join(__dirname, "fixtures/issue_body.md"),
  'utf-8'
);

const expected_issue = {
  title: "Copilot Usage - PR#44",
  body: issue_body,
  assignee: "mageroni"
}

const privateKey = fs.readFileSync(
  path.join(__dirname, "fixtures/mock-cert.pem"),
  "utf-8"
);

describe("My Probot app", () => {
  let probot;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    // Load our app into probot
    probot.load(myProbotApp);
  });

  test("creates an issue when a Pull Request is closed", async () => {
    const mock = nock("https://api.github.com")
      // Test that we correctly return a test token
      .post("/app/installations/35217443/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          issues: "write",
        },
      })

      // Test that a issue is created
      .post("/repos/mageroni/TestRepo/issues", (body) => {
        expect(body).toMatchObject(expected_issue);
        return true;
      })
      .reply(200);

    // Receive a webhook event
    await probot.receive({ name: "pull_request", payload : payload_pr_closed });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test("closes an issue after it's been completed - yes and percentage are added", async () => {
    const mock = nock("https://api.github.com")
      // Test that we correctly return a test token
      .post("/app/installations/35217443/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          issues: "write",
        },
      })

      .get("/repos/mageroni/TestRepo/contents/results.csv")
      .reply(200, {
        "name": "results.csv",
        "path": "results.csv",
        "content": "ZW50ZXJwcmlzZV9uYW1lLG9yZ2FuaXphdGlvbl9uYW1lLHJlcG9zaXRvcnlfbmFtZSxpc3N1ZV9pZCxpc3N1ZV9udW1iZXIsUFJfbnVtYmVyLGFzc2lnbmVlX25hbWUsaXNfY29waWxvdF91c2VkLHNhdmluZ19wZXJjZW50YWdlLHVzYWdlX2ZyZXF1ZW5jeSxjb21tZW50LGNyZWF0ZWRfYXQsY29tcGxldGVkX2F0CiwsVGVzdFJlcG8sMjAwMDA5NTYyNCwxNyw1LG1hZ2Vyb25pLDEsLCwsMjAyMy0xMS0xN1QyMzo1Mzo1MlosMjAyMy0xMS0xN1QyMzo1NDo0MloKLG1hZ2Vyb25pLFRlc3RSZXBvLDE2MzA2MzM4NzUsNjIsNDQsLDEsPiAyMSUgYnV0IDwgMzAlLEFsbCBvciBtb3N0IG9mIHRoZSB0aW1lLCwyMDIzLTAzLTE4VDIyOjAwOjM0WiwyMDIz",
        "sha": "d8a6e6d4f4f3f2f1f0",
        "url": "https://api.github.com/repos/mageroni/TestRepo/contents/results.csv?ref=master",
      })

      .put('/repos/mageroni/TestRepo/contents/results.csv')
      .reply(200)

      .patch("/repos/mageroni/TestRepo/issues/62", (body) => {
        expect(body).toMatchObject({state: 'closed'});
        return true;
      })
      .reply(200);

    // Receive a webhook event
    await probot.receive({ name: "issues", payload : payload_issues_edited });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test("closes an issue if a comment is received", async () => {
    const mock = nock("https://api.github.com")
      // Test that we correctly return a test token
      .post("/app/installations/35217443/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          issues: "write",
        },
      })

      .get("/repos/mageroni/TestRepo/contents/results.csv")
      .reply(200, {
        "name": "results.csv",
        "path": "results.csv",
        "sha": "d8a6e6d4f4f3f2f1f0",
        "content": "ZW50ZXJwcmlzZV9uYW1lLG9yZ2FuaXphdGlvbl9uYW1lLHJlcG9zaXRvcnlfbmFtZSxpc3N1ZV9pZCxpc3N1ZV9udW1iZXIsUFJfbnVtYmVyLGFzc2lnbmVlX25hbWUsaXNfY29waWxvdF91c2VkLHNhdmluZ19wZXJjZW50YWdlLHVzYWdlX2ZyZXF1ZW5jeSxjb21tZW50LGNyZWF0ZWRfYXQsY29tcGxldGVkX2F0CiwsVGVzdFJlcG8sMjAwMDA5NTYyNCwxNyw1LG1hZ2Vyb25pLDEsLCwsMjAyMy0xMS0xN1QyMzo1Mzo1MlosMjAyMy0xMS0xN1QyMzo1NDo0MloKLG1hZ2Vyb25pLFRlc3RSZXBvLDE2MzA2MzM4NzUsNjIsNDQsLDEsPiAyMSUgYnV0IDwgMzAlLEFsbCBvciBtb3N0IG9mIHRoZSB0aW1lLCwyMDIzLTAzLTE4VDIyOjAwOjM0WiwyMDIz",
        "url": "https://api.github.com/repos/mageroni/TestRepo/contents/results.csv?ref=master",
      })

      .put('/repos/mageroni/TestRepo/contents/results.csv')
      .reply(200)

      .patch("/repos/mageroni/TestRepo/issues/60", (body) => {
        expect(body).toMatchObject({state: 'closed'});
        return true;
      })
      .reply(200);

    // Receive a webhook event
    await probot.receive({ name: "issue_comment", payload : issue_comment_created });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about testing with Nock see:
// https://github.com/nock/nock
