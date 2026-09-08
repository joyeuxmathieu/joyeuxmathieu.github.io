import express from "express";
import cors from "cors";
import session from "express-session";
import { Client, GatewayIntentBits } from "discord.js";

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURATION
// ======================================================

const WEBSITE_URL = "https://joyeuxmathieu.github.io";
const API_URL = "https://api.alphark.fr";

// ID DU SERVEUR DISCORD ALPHARK
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// ======================================================
// DISCORD BOT
// ======================================================

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json());

app.use(
    cors({
        origin: WEBSITE_URL,
        credentials: true
    })
);

app.set("trust proxy", 1);

app.use(
    session({
        secret: process.env.SESSION_SECRET || "CHANGE-ME",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    })
);

// ======================================================
// PAGE API
// ======================================================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "2.0.0",
        discord: discordClient.isReady()
            ? "connected"
            : "connecting"
    });
});

// ======================================================
// CONNEXION DISCORD
// ======================================================

app.get("/auth/discord", (req, res) => {

    const clientId = process.env.DISCORD_CLIENT_ID;

    if (!clientId) {
        return res.status(500).send(
            "DISCORD_CLIENT_ID manquant."
        );
    }

    const redirectUri =
        process.env.DISCORD_REDIRECT_URI ||
        `${API_URL}/auth/discord/callback`;

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "identify"
    });

    const discordUrl =
        `https://discord.com/oauth2/authorize?${params.toString()}`;

    res.redirect(discordUrl);
});

// ======================================================
// RETOUR DISCORD
// ======================================================

app.get("/auth/discord/callback", async (req, res) => {

    try {

        const { code } = req.query;

        if (!code) {
            return res.status(400).send(
                "Code Discord manquant."
            );
        }

        const clientId = process.env.DISCORD_CLIENT_ID;
        const clientSecret = process.env.DISCORD_CLIENT_SECRET;

        const redirectUri =
            process.env.DISCORD_REDIRECT_URI ||
            `${API_URL}/auth/discord/callback`;

        // --------------------------------------------------
        // RÉCUPÉRATION DU TOKEN DISCORD
        // --------------------------------------------------

        const tokenResponse = await fetch(
            "https://discord.com/api/oauth2/token",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: "authorization_code",
                    code: code,
                    redirect_uri: redirectUri
                })
            }
        );

        if (!tokenResponse.ok) {

            const error =
                await tokenResponse.text();

            console.error(
                "Erreur token Discord:",
                error
            );

            return res.status(401).send(
                "Impossible de valider la connexion Discord."
            );
        }

        const tokenData =
            await tokenResponse.json();

        // --------------------------------------------------
        // RÉCUPÉRATION DU PROFIL DISCORD
        // --------------------------------------------------

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
            return res.status(401).send(
                "Impossible de récupérer ton compte Discord."
            );
        }

        const discordUser =
            await userResponse.json();

        console.log(
            `Connexion Discord : ${discordUser.username} (${discordUser.id})`
        );

        // --------------------------------------------------
        // VÉRIFICATION DU SERVEUR ALPHARK
        // --------------------------------------------------

        if (!discordClient.isReady()) {

            return res.status(503).send(
                "Le système Discord ALPHARK est momentanément indisponible."
            );
        }

        const guild =
            await discordClient.guilds.fetch(GUILD_ID);

        if (!guild) {

            return res.status(500).send(
                "Serveur Discord ALPHARK introuvable."
            );
        }

        let member = null;

        try {

            member =
                await guild.members.fetch(discordUser.id);

        } catch {

            member = null;

        }

        // --------------------------------------------------
        // JOUEUR NON MEMBRE
        // --------------------------------------------------

        if (!member) {

            return res.status(403).send(`
                <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>ALPHARK - Accès refusé</title>
                    </head>

                    <body style="
                        background:#080b12;
                        color:white;
                        font-family:Arial;
                        text-align:center;
                        padding-top:100px;
                    ">

                        <h1>❌ Accès refusé</h1>

                        <p>
                            Tu dois être membre du Discord ALPHARK
                            pour accéder à ton espace joueur.
                        </p>

                        <br>

                        <a
                            href="${WEBSITE_URL}"
                            style="
                                color:#00eaff;
                                text-decoration:none;
                                font-size:18px;
                            "
                        >
                            ← Retour sur ALPHARK
                        </a>

                    </body>
                </html>
            `);
        }

        // --------------------------------------------------
        // CONNEXION RÉUSSIE
        // --------------------------------------------------

        req.session.user = {

            id: discordUser.id,

            username:
                discordUser.username,

            globalName:
                discordUser.global_name ||
                discordUser.username,

            avatar:
                discordUser.avatar,

            joinedAt:
                member.joinedAt,

            roles:
                member.roles.cache
                    .filter(role => role.id !== guild.id)
                    .map(role => ({
                        id: role.id,
                        name: role.name
                    }))
        };

        // --------------------------------------------------
        // RETOUR SITE
        // --------------------------------------------------

        res.redirect(
            `${WEBSITE_URL}/?connexion=success`
        );

    } catch (error) {

        console.error(
            "Erreur connexion Discord:",
            error
        );

        res.status(500).send(
            "Erreur interne ALPHARK."
        );
    }
});

// ======================================================
// UTILISATEUR CONNECTÉ
// ======================================================

app.get("/api/me", (req, res) => {

    if (!req.session.user) {

        return res.json({
            connected: false
        });
    }

    res.json({
        connected: true,
        user: req.session.user
    });
});

// ======================================================
// DÉCONNEXION
// ======================================================

app.get("/auth/logout", (req, res) => {

    req.session.destroy(() => {

        res.redirect(
            WEBSITE_URL
        );

    });
});

// ======================================================
// BOT DISCORD PRÊT
// ======================================================

discordClient.once("ready", () => {

    console.log(
        `🤖 Bot Discord connecté : ${discordClient.user.tag}`
    );

    console.log(
        `🏠 Serveur ALPHARK : ${GUILD_ID}`
    );

});

// ======================================================
// CONNEXION DU BOT
// ======================================================

if (process.env.DISCORD_BOT_TOKEN) {

    discordClient.login(
        process.env.DISCORD_BOT_TOKEN
    );

} else {

    console.error(
        "❌ DISCORD_BOT_TOKEN manquant."
    );
}

// ======================================================
// DÉMARRAGE API
// ======================================================

app.listen(PORT, () => {

    console.log(
        `🚀 ALPHARK API démarrée sur le port ${PORT}`
    );

});
