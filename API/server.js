import express from "express";
import cors from "cors";
import session from "express-session";
import { Client, GatewayIntentBits } from "discord.js";

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_GUILD_ID = "1496186723527426290";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!DISCORD_CLIENT_ID) console.error("❌ DISCORD_CLIENT_ID manquant");
if (!DISCORD_CLIENT_SECRET) console.error("❌ DISCORD_CLIENT_SECRET manquant");
if (!DISCORD_BOT_TOKEN) console.error("❌ DISCORD_BOT_TOKEN manquant");
if (!DISCORD_REDIRECT_URI) console.error("❌ DISCORD_REDIRECT_URI manquant");
if (!SESSION_SECRET) console.error("❌ SESSION_SECRET manquant");

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds]
});

discordClient.once("ready", () => {
  console.log(`🤖 Bot ALPHARK connecté : ${discordClient.user.tag}`);
});

discordClient.login(DISCORD_BOT_TOKEN);

app.use(express.json());

app.use(cors({
  origin: [
    "https://alphark.fr",
    "https://www.alphark.fr"
  ],
  credentials: true
}));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: "none",
    domain: ".alphark.fr",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "ALPHARK API",
    version: "1.0.0"
  });
});

app.get("/auth/discord", (req, res) => {

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: DISCORD_REDIRECT_URI,
    scope: "identify"
  });

  const url =
    "https://discord.com/oauth2/authorize?" +
    params.toString();

  res.redirect(url);
});

app.get("/auth/discord/callback", async (req, res) => {

  try {

    const code = req.query.code;

    if (!code) {
      return res.status(400).send("Code Discord manquant.");
    }

    const tokenResponse = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: DISCORD_REDIRECT_URI
        })
      }
    );

    if (!tokenResponse.ok) {

      console.error(
        await tokenResponse.text()
      );

      return res
        .status(401)
        .send("Impossible de valider la connexion Discord.");
    }

    const tokenData =
      await tokenResponse.json();

    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization:
            `Bearer ${tokenData.access_token}`
        }
      }
    );

    if (!userResponse.ok) {

      return res
        .status(401)
        .send("Impossible de récupérer votre compte Discord.");
    }

    const user =
      await userResponse.json();

    let member = null;

    try {

      const guild =
        await discordClient.guilds.fetch(
          DISCORD_GUILD_ID
        );

      member =
        await guild.members.fetch(user.id);

    } catch (error) {

      console.log(
        `❌ ${user.username} n'est pas membre d'ALPHARK.`
      );
    }

    if (!member) {

      return res.redirect(
        "https://alphark.fr/?discord=not_member"
      );
    }

    req.session.user = {

      id: user.id,

      username:
        user.global_name ||
        user.username,

      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`
    };

    console.log(
      `✅ Connexion ALPHARK : ${user.username}`
    );

    res.redirect(
      "https://alphark.fr/?discord=connected"
    );

  } catch (error) {

    console.error(
      "Erreur connexion Discord :",
      error
    );

    res
      .status(500)
      .send("Erreur interne ALPHARK.");
  }
});

app.get("/api/me", (req, res) => {

  if (!req.session.user) {

    return res
      .status(401)
      .json({
        loggedIn: false
      });
  }

  res.json({

    loggedIn: true,

    user: req.session.user

  });
});

app.get("/auth/logout", (req, res) => {

  req.session.destroy(() => {

    res.redirect(
      "https://alphark.fr/"
    );

  });

});

app.listen(PORT, () => {

  console.log(
    `🚀 API ALPHARK démarrée sur le port ${PORT}`
  );

});
