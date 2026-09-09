import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";
import { Client, GatewayIntentBits } from "discord.js";

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURATION ALPHARK
// ======================================================

const WEBSITE_URL = "https://joyeuxmathieu.github.io";
const ALPHARK_URL = "https://www.alphark.fr";
const API_URL = "https://api.alphark.fr";

const GUILD_ID = process.env.DISCORD_GUILD_ID;

// ======================================================
// CLIENT DISCORD
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
        origin: [
            WEBSITE_URL,
            ALPHARK_URL,
            "https://alphark.fr"
        ],
        credentials: true
    })
);

app.set("trust proxy", 1);

// ======================================================
// SESSION
// ======================================================

app.use(
    session({
        secret:
            process.env.SESSION_SECRET || "CHANGE-ME",

        resave: false,

        saveUninitialized: false,

        proxy: true,

        cookie: {
            httpOnly: true,

            secure: true,

            sameSite: "none",

            maxAge:
                7 * 24 * 60 * 60 * 1000
        }
    })
);

// ======================================================
// PAGE PRINCIPALE API
// ======================================================

app.get("/", (req, res) => {

    res.json({

        status: "online",

        service: "ALPHARK API",

        version: "2.2.0",

        discord:
            discordClient.isReady()
                ? "connected"
                : "connecting"

    });

});

// ======================================================
// TEST DISCORD
// ======================================================

app.get("/api/discord-status", (req, res) => {

    res.json({

        connected:
            discordClient.isReady(),

        bot:
            discordClient.user
                ? {
                    id: discordClient.user.id,
                    username:
                        discordClient.user.username
                }
                : null,

        guildId:
            GUILD_ID || null

    });

});

// ======================================================
// CONNEXION DISCORD
// ======================================================

app.get("/auth/discord", (req, res) => {

    try {

        const clientId =
            process.env.DISCORD_CLIENT_ID;

        if (!clientId) {

            console.error(
                "❌ DISCORD_CLIENT_ID manquant."
            );

            return res.status(500).send(
                "Configuration Discord incomplète."
            );

        }

        const redirectUri =
            process.env.DISCORD_REDIRECT_URI ||
            `${API_URL}/auth/discord/callback`;

        // --------------------------------------------------
        // STATE DE SÉCURITÉ
        // --------------------------------------------------

        const state =
            crypto.randomBytes(32).toString("hex");

        req.session.oauthState = state;

        // --------------------------------------------------
        // PARAMÈTRES OAUTH2
        // --------------------------------------------------

        const params =
            new URLSearchParams({

                client_id:
                    clientId,

                response_type:
                    "code",

                redirect_uri:
                    redirectUri,

                scope:
                    "identify",

                state:
                    state

            });

        const discordUrl =
            `https://discord.com/oauth2/authorize?${params.toString()}`;

        console.log(
            "🔐 Redirection vers Discord OAuth2..."
        );

        res.redirect(discordUrl);

    } catch (error) {

        console.error(
            "❌ Erreur OAuth2 :",
            error
        );

        res.status(500).send(
            "Erreur lors de la connexion Discord."
        );

    }

});

// ======================================================
// RETOUR DISCORD
// ======================================================

app.get(
    "/auth/discord/callback",
    async (req, res) => {

        try {

            const {
                code,
                state,
                error
            } = req.query;

            // ==================================================
            // UTILISATEUR REFUSE
            // ==================================================

            if (error) {

                console.log(
                    "❌ Utilisateur a refusé la connexion Discord."
                );

                return res.redirect(
                    `${WEBSITE_URL}/?connexion=refused`
                );

            }

            // ==================================================
            // CODE MANQUANT
            // ==================================================

            if (!code) {

                console.error(
                    "❌ Code Discord manquant."
                );

                return res.status(400).send(
                    "Code Discord manquant."
                );

            }

            // ==================================================
            // VÉRIFICATION STATE
            // ==================================================

            if (
                !state ||
                !req.session.oauthState ||
                state !== req.session.oauthState
            ) {

                console.error(
                    "❌ State OAuth2 invalide."
                );

                return res.status(403).send(
                    "Connexion Discord invalide ou expirée."
                );

            }

            delete req.session.oauthState;

            // ==================================================
            // CONFIGURATION DISCORD
            // ==================================================

            const clientId =
                process.env.DISCORD_CLIENT_ID;

            const clientSecret =
                process.env.DISCORD_CLIENT_SECRET;

            const redirectUri =
                process.env.DISCORD_REDIRECT_URI ||
                `${API_URL}/auth/discord/callback`;

            if (
                !clientId ||
                !clientSecret
            ) {

                console.error(
                    "❌ Client ID ou Client Secret manquant."
                );

                return res.status(500).send(
                    "Configuration Discord incomplète."
                );

            }

            // ==================================================
            // ÉCHANGE CODE → TOKEN
            // ==================================================

            console.log(
                "🔄 Validation du code Discord..."
            );

            const basicAuth =
                Buffer
                    .from(
                        `${clientId}:${clientSecret}`
                    )
                    .toString("base64");

            const tokenResponse =
                await fetch(
                    "https://discord.com/api/v10/oauth2/token",
                    {

                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/x-www-form-urlencoded",

                            "Authorization":
                                `Basic ${basicAuth}`

                        },

                        body:
                            new URLSearchParams({

                                grant_type:
                                    "authorization_code",

                                code:
                                    code,

                                redirect_uri:
                                    redirectUri

                            })

                    }
                );

            // ==================================================
            // ERREUR TOKEN
            // ==================================================

            if (!tokenResponse.ok) {

                const errorText =
                    await tokenResponse.text();

                console.error(
                    "❌ Erreur token Discord HTTP:",
                    tokenResponse.status
                );

                console.error(
                    errorText.substring(0, 1000)
                );

                return res.status(401).send(
                    "Impossible de valider ta connexion Discord."
                );

            }

            const tokenData =
                await tokenResponse.json();

            console.log(
                "✅ Token Discord obtenu."
            );

            // ==================================================
            // RÉCUPÉRATION UTILISATEUR DISCORD
            // ==================================================

            const userResponse =
                await fetch(
                    "https://discord.com/api/v10/users/@me",
                    {

                        method: "GET",

                        headers: {

                            "Authorization":
                                `Bearer ${tokenData.access_token}`

                        }

                    }
                );

            if (!userResponse.ok) {

                const errorText =
                    await userResponse.text();

                console.error(
                    "❌ Erreur récupération utilisateur Discord:",
                    userResponse.status
                );

                console.error(
                    errorText.substring(0, 1000)
                );

                return res.status(401).send(
                    "Impossible de récupérer ton compte Discord."
                );

            }

            const discordUser =
                await userResponse.json();

            console.log(
                `👤 Utilisateur Discord : ${discordUser.username}`
            );

            console.log(
                `🆔 Discord ID : ${discordUser.id}`
            );

            // ==================================================
            // VÉRIFICATION BOT
            // ==================================================

            if (!discordClient.isReady()) {

                console.error(
                    "❌ Le bot Discord n'est pas connecté."
                );

                return res.status(503).send(
                    "Le système Discord ALPHARK est momentanément indisponible."
                );

            }

            // ==================================================
            // VÉRIFICATION GUILD
            // ==================================================

            if (!GUILD_ID) {

                console.error(
                    "❌ DISCORD_GUILD_ID manquant."
                );

                return res.status(500).send(
                    "Le serveur Discord ALPHARK n'est pas configuré."
                );

            }

            let guild;

            try {

                guild =
                    await discordClient.guilds.fetch(
                        GUILD_ID
                    );

            } catch (error) {

                console.error(
                    "❌ Impossible de récupérer le serveur ALPHARK."
                );

                console.error(
                    error.message
                );

                return res.status(500).send(
                    "Impossible d'accéder au serveur Discord ALPHARK."
                );

            }

            console.log(
                `🏠 Serveur Discord : ${guild.name}`
            );

            // ==================================================
            // VÉRIFICATION MEMBRE
            // ==================================================

            let member = null;

            try {

                member =
                    await guild.members.fetch(
                        discordUser.id
                    );

            } catch (error) {

                console.log(
                    `🚫 ${discordUser.username} n'est pas membre d'ALPHARK.`
                );

                member = null;

            }

            // ==================================================
            // PAS MEMBRE
            // ==================================================

            if (!member) {

                return res.redirect(
                    `${WEBSITE_URL}/?connexion=not_member`
                );

            }

            console.log(
                `✅ ${discordUser.username} est membre d'ALPHARK.`
            );

            // ==================================================
            // RÔLES DISCORD
            // ==================================================

            const roles =
                member.roles.cache
                    .filter(
                        role =>
                            role.id !== guild.id
                    )
                    .map(
                        role => ({

                            id:
                                role.id,

                            name:
                                role.name

                        })
                    );

            // ==================================================
            // SESSION UTILISATEUR
            // ==================================================

            req.session.user = {

                id:
                    discordUser.id,

                username:
                    discordUser.username,

                globalName:
                    discordUser.global_name ||
                    discordUser.username,

                avatar:
                    discordUser.avatar || null,

                joinedAt:
                    member.joinedAt || null,

                roles:
                    roles

            };

            // ==================================================
            // SAUVEGARDE SESSION
            // ==================================================

            req.session.save(
                (saveError) => {

                    if (saveError) {

                        console.error(
                            "❌ Erreur sauvegarde session :",
                            saveError
                        );

                        return res.status(500).send(
                            "Impossible de créer ta session."
                        );

                    }

                    console.log(
                        `🎉 CONNEXION ALPHARK RÉUSSIE : ${discordUser.username}`
                    );

                    res.redirect(
                        `${WEBSITE_URL}/?connexion=success`
                    );

                }
            );

        } catch (error) {

            console.error(
                "❌ ERREUR GÉNÉRALE OAUTH2 :"
            );

            console.error(
                error
            );

            res.status(500).send(
                "Une erreur est survenue pendant la connexion."
            );

        }

    }
);

// ======================================================
// UTILISATEUR CONNECTÉ
// ======================================================

app.get("/api/me", (req, res) => {

    if (!req.session.user) {

        return res.json({

            connected:
                false

        });

    }

    res.json({

        connected:
            true,

        user:
            req.session.user

    });

});

// ======================================================
// DÉCONNEXION
// ======================================================

app.get("/auth/logout", (req, res) => {

    req.session.destroy(
        (error) => {

            if (error) {

                console.error(
                    "❌ Erreur déconnexion :",
                    error
                );

                return res.status(500).send(
                    "Impossible de se déconnecter."
                );

            }

            res.clearCookie(
                "connect.sid",
                {
                    httpOnly: true,
                    secure: true,
                    sameSite: "none"
                }
            );

            res.redirect(
                WEBSITE_URL
            );

        }
    );

});

// ======================================================
// TEST SESSION
// ======================================================

app.get("/api/session", (req, res) => {

    res.json({

        connected:
            !!req.session.user,

        user:
            req.session.user || null

    });

});

// ======================================================
// BOT DISCORD READY
// ======================================================

discordClient.once(
    "ready",
    () => {

        console.log(
            `🤖 Bot Discord connecté : ${discordClient.user.tag}`
        );

        console.log(
            `🆔 Bot ID : ${discordClient.user.id}`
        );

        console.log(
            `🏠 Serveur ALPHARK : ${GUILD_ID || "MANQUANT"}`
        );

    }
);

// ======================================================
// ERREUR DISCORD
// ======================================================

discordClient.on(
    "error",
    (error) => {

        console.error(
            "❌ Erreur Discord :"
        );

        console.error(
            error
        );

    }
);

// ======================================================
// DIAGNOSTIC VARIABLES
// ======================================================

console.log(
    "🔎 Vérification configuration Discord..."
);

console.log(
    "DISCORD_CLIENT_ID :",
    process.env.DISCORD_CLIENT_ID
        ? "✅ présent"
        : "❌ MANQUANT"
);

console.log(
    "DISCORD_CLIENT_SECRET :",
    process.env.DISCORD_CLIENT_SECRET
        ? "✅ présent"
        : "❌ MANQUANT"
);

console.log(
    "DISCORD_BOT_TOKEN :",
    process.env.DISCORD_BOT_TOKEN
        ? "✅ présent"
        : "❌ MANQUANT"
);

console.log(
    "DISCORD_GUILD_ID :",
    process.env.DISCORD_GUILD_ID
        ? "✅ présent"
        : "❌ MANQUANT"
);

console.log(
    "SESSION_SECRET :",
    process.env.SESSION_SECRET
        ? "✅ présent"
        : "❌ MANQUANT"
);

console.log(
    "DISCORD_REDIRECT_URI :",
    process.env.DISCORD_REDIRECT_URI
        ? "✅ présent"
        : "❌ MANQUANT"
);

// ======================================================
// CONNEXION DU BOT
// ======================================================

if (
    !process.env.DISCORD_BOT_TOKEN
) {

    console.error(
        "❌ DISCORD_BOT_TOKEN MANQUANT DANS RENDER"
    );

} else {

    console.log(
        "🔐 Tentative de connexion du bot à Discord..."
    );

    discordClient
        .login(
            process.env.DISCORD_BOT_TOKEN
        )
        .then(
            () => {

                console.log(
                    "✅ Demande de connexion Discord envoyée."
                );

            }
        )
        .catch(
            (error) => {

                console.error(
                    "❌ ERREUR CONNEXION DISCORD :"
                );

                console.error(
                    error.message
                );

            }
        );

}

// ======================================================
// DÉMARRAGE API
// ======================================================

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 ALPHARK API démarrée sur le port ${PORT}`
        );

    }
);
