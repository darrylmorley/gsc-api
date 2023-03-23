const { google } = require("googleapis");
const { OAuth2 } = google.auth;
require("dotenv").config();
const express = require("express");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 2000;

app.get("/", (req, res) => res.send("Hello World!"));

app.listen(port, () => console.log(`App listening on port: ${port}`));

const oauth2Client = new OAuth2({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: "http://localhost:2000/oauth2callback",
});

const scopes = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/webmasters",
];

const searchconsole = google.searchconsole({
  version: "v1",
  auth: oauth2Client,
});

app.get("/login", (req, res) => {
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
  });
  res.redirect(authorizeUrl);
});

app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  console.log("tokens: ", tokens);
  oauth2Client.setCredentials(tokens);

  await prisma.auth.upsert({
    where: { id: 1 },
    create: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    },
  });

  res.redirect("/");
});

app.get("/inspecturl", async (req, res) => {
  const { url } = req.query;
  const credentials = await prisma.auth.findUnique({ where: { id: 1 } });
  console.log("db credentials: ", credentials);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  searchconsole.urlInspection.index.inspect(
    {
      siteUrl: process.env.SITE_URL,
      inspectionUrl: url,
    },
    (err, response) => {
      if (err) return res.status(500).send(`Error: ${err}`);
      res.send(response.data);
    }
  );
});

app.get("/traffic", async (req, res) => {
  const { url } = req.query;
  console.log(url);
  const credentials = await prisma.auth.findUnique({ where: { id: 1 } });
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  const startDate = "2023-01-01";
  const endDate = "2023-01-01";

  searchconsole.searchanalytics.query(
    {
      siteUrl: process.env.SITE_URL,
      requestBody: {
        startDate: startDate,
        endDate: endDate,
        dimensions: ["page"],
        filters: [
          {
            dimension: "page",
            operator: "equals",
            expression: url,
          },
        ],
        startRow: 0,
        rowLimit: 10000,
      },
    },
    async (err, response) => {
      if (err) return res.status(500).send(`Error: ${err}`);

      for (const stat of response.data.rows) {
        await prisma.stats.create({
          data: {
            url: stat.keys[0],
            clicks: stat.clicks,
            impressions: stat.impressions,
            ctr: stat.ctr,
            position: Math.round(stat.position),
            date: new Date(startDate),
          },
        });
      }

      res.send(response.data);
    }
  );
});

app.get("/listsite", async (req, res) => {
  const credentials = await prisma.auth.findUnique({ where: { id: 1 } });
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  searchconsole.sites.list({}, (err, response) => {
    if (err) return res.status(500).send(`Error: ${err}`);
    res.send(response.data);
  });
});
