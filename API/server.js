import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURATION ALPHARK
// ======================================================

const WEBSITE_URL = "https://joyeuxmathieu.github.io";
const ALPHARK_URL = "https://www.alphark.fr";
const API_URL = "https://api.alphark.fr";

const DISCORD_API = "https://discord.com/api/v10";

const GUILD_ID = process.env.DISCORD_GUILD_ID;

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
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    })
);

// ======================================================
// FONCTION DISCORD REST
// ======================================================

async function discordRequest(
    endpoint,
    options = {}
) {

    const token =
        process.env.DISCORD_BOT_TOKEN;

    if (!token) {

        throw new Error(
            "DISCORD_BOT_TOKEN manquant"
        );

    }

    const response =
        await fetch(
            `${DISCORD_API}${endpoint}`,
            {

                ...options,

                headers: {

                    ...(options.headers || {}),

                    "Authorization":
                        `Bot ${token}`,

                    "Content-Type":
                        "application/json"

                }

            }
        );

    return response;
}

// ======================================================
// PAGE PRINCIPALE API
// ======================================================

app.get(
    "/",
    (req, res) => {

        res.json({

            status: "online",

            service:
                "ALPHARK API",

            version:
                "3.0.0",

            oauth:
                "Discord OAuth2",

            discord:
                "REST API",

            guildId:
                GUILD_ID || null

        });

    }
);

// ======================================================
// TEST DISCORD REST
// ======================================================

app.get(
    "/api/discord-status",
    async (req, res) => {

        try {

            if (
                !process.env.DISCORD_BOT_TOKEN
            ) {

                return res.json({

                    connected:
                        false,

                    error:
                        "DISCORD_BOT_TOKEN manquant"

                });

            }

            // ------------------------------------------
            // TEST DU BOT
            // ------------------------------------------

            const botResponse =
                await discordRequest(
                    "/users/@me"
                );

            if (!botResponse.ok) {

                const errorText =
                    await botResponse.text();

                console.error(
                    "❌ Discord /users/@me :",
                    botResponse.status,
                    errorText
                );

                return res.status(500).json({

                    connected:
                        false,

                    bot:
                        null,

                    guildId:
                        GUILD_ID || null,

                    error:
                        `Discord HTTP ${botResponse.status}`

                });

            }

            const bot =
                await botResponse.json();

            // ------------------------------------------
            // TEST DU SERVEUR
            // ------------------------------------------

            let guild = null;

            if (GUILD_ID) {

                const guildResponse =
                    await discordRequest(
                        `/guilds/${GUILD_ID}`
                    );

                if (guildResponse.ok) {

                    guild =
                        await guildResponse.json();

                }

            }

            res.json({

                connected:
                    true,

                bot: {

                    id:
                        bot.id,

                    username:
                        bot.username,

                    discriminator:
                        bot.discriminator || null

                },

                guildId:
                    GUILD_ID || null,

                guild: guild
                    ? {

                        id:
                            guild.id,

                        name:
                            guild.name

                    }
                    : null

            });

        } catch (error) {

            console.error(
                "❌ Erreur Discord REST :",
                error
            );

            res.status(500).json({

                connected:
                    false,

                bot:
                    null,

                guildId:
                    GUILD_ID || null,

                error:
                    error.message

            });

        }

    }
);

// ======================================================
// CONNEXION DISCORD
// ======================================================

app.get(
    "/auth/discord",
    (req, res) => {

        try {

            const clientId =
                process.env.DISCORD_CLIENT_ID;

            if (!clientId) {

                return res.status(500).send(
                    "DISCORD_CLIENT_ID manquant."
                );

            }

            const redirectUri =
                process.env.DISCORD_REDIRECT_URI ||
                `${API_URL}/auth/discord/callback`;

            // ------------------------------------------
            // PROTECTION CSRF
            // ------------------------------------------

            const state =
                crypto
                    .randomBytes(32)
                    .toString("hex");

            req.session.oauthState =
                state;

            // ------------------------------------------
            // URL DISCORD
            // ------------------------------------------

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

            res.redirect(
                discordUrl
            );

        } catch (error) {

            console.error(
                "❌ Erreur OAuth2 :",
                error
            );

            res.status(500).send(
                "Erreur lors de la connexion Discord."
            );

        }

    }
);

// ======================================================
// CALLBACK DISCORD
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

            // ------------------------------------------
            // REFUS DISCORD
            // ------------------------------------------

            if (error) {

                console.log(
                    "❌ Connexion Discord refusée."
                );

                return res.redirect(
                    `${WEBSITE_URL}/?connexion=refused`
                );

            }

            // ------------------------------------------
            // CODE MANQUANT
            // ------------------------------------------

            if (!code) {

                console.error(
                    "❌ Code Discord manquant."
                );

                return res.status(400).send(
                    "Code Discord manquant."
                );

            }

            // ------------------------------------------
            // VALIDATION STATE
            // ------------------------------------------

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

            // ------------------------------------------
            // VARIABLES
            // ------------------------------------------

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

                return res.status(500).send(
                    "Configuration Discord incomplète."
                );

            }

            // ------------------------------------------
            // ÉCHANGE CODE → TOKEN
            // ------------------------------------------

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
                    `${DISCORD_API}/oauth2/token`,
                    {

                        method:
                            "POST",

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

            if (!tokenResponse.ok) {

                const errorText =
                    await tokenResponse.text();

                console.error(
                    "❌ Erreur token Discord HTTP:",
                    tokenResponse.status
                );

                console.error(
                    errorText.substring(
                        0,
                        1000
                    )
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

            // ------------------------------------------
            // RÉCUPÉRATION UTILISATEUR
            // ------------------------------------------

            const userResponse =
                await fetch(
                    `${DISCORD_API}/users/@me`,
                    {

                        method:
                            "GET",

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
                    "❌ Erreur utilisateur Discord:",
                    userResponse.status
                );

                console.error(
                    errorText.substring(
                        0,
                        1000
                    )
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

            // ------------------------------------------
            // VÉRIFICATION SERVEUR ALPHARK
            // ------------------------------------------

            if (!GUILD_ID) {

                console.error(
                    "❌ DISCORD_GUILD_ID manquant."
                );

                return res.status(500).send(
                    "Le serveur Discord ALPHARK n'est pas configuré."
                );

            }

            console.log(
                "🔎 Vérification de l'appartenance à ALPHARK..."
            );

            const memberResponse =
                await discordRequest(
                    `/guilds/${GUILD_ID}/members/${discordUser.id}`
                );

            // ------------------------------------------
            // JOUEUR NON PRÉSENT
            // ------------------------------------------

            if (
                memberResponse.status === 404
            ) {

                console.log(
                    `🚫 ${discordUser.username} n'est pas membre d'ALPHARK.`
                );

                return res.redirect(
                    `${WEBSITE_URL}/?connexion=not_member`
                );

            }

            // ------------------------------------------
            // ERREUR DISCORD
            // ------------------------------------------

            if (!memberResponse.ok) {

                const errorText =
                    await memberResponse.text();

                console.error(
                    "❌ Erreur vérification membre:",
                    memberResponse.status
                );

                console.error(
                    errorText.substring(
                        0,
                        1000
                    )
                );

                return res.status(500).send(
                    "Impossible de vérifier ton appartenance au serveur ALPHARK."
                );

            }

            // ------------------------------------------
            // MEMBRE TROUVÉ
            // ------------------------------------------

            const member =
                await memberResponse.json();

            console.log(
                `✅ ${discordUser.username} est membre d'ALPHARK.`
            );

            // ------------------------------------------
            // RÔLES
            // ------------------------------------------

            const roles =
                Array.isArray(member.roles)
                    ? member.roles
                    : [];

            // ------------------------------------------
            // SESSION
            // ------------------------------------------

            req.session.user = {

                id:
                    discordUser.id,

                username:
                    discordUser.username,

                globalName:
                    discordUser.global_name ||
                    member.nick ||
                    discordUser.username,

                nickname:
                    member.nick ||
                    null,

                avatar:
                    discordUser.avatar ||
                    null,

                joinedAt:
                    member.joined_at ||
                    null,

                roles:
                    roles

            };

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

app.get(
    "/api/me",
    (req, res) => {

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

    }
);

// ======================================================
// SESSION
// ======================================================

app.get(
    "/api/session",
    (req, res) => {

        res.json({

            connected:
                !!req.session.user,

            user:
                req.session.user ||
                null

        });

    }
);

// ======================================================
// DÉCONNEXION
// ======================================================

app.get(
    "/auth/logout",
    (req, res) => {

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

                        httpOnly:
                            true,

                        secure:
                            true,

                        sameSite:
                            "none"

                    }
                );

                res.redirect(
                    WEBSITE_URL
                );

            }
        );

    }
);

// ======================================================
// DIAGNOSTIC CONFIGURATION
// ======================================================

console.log(
    "🔎 Vérification configuration ALPHARK..."
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
// DÉMARRAGE
// ======================================================

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 ALPHARK API démarrée sur le port ${PORT}`
        );

        console.log(
            "🌐 Discord Gateway : DÉSACTIVÉ"
        );

        console.log(
            "🔗 Discord REST API : ACTIVÉ"
        );

    }
);
