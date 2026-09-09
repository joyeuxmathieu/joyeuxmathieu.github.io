import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";

const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURATION DISCORD
// ==========================================

const DISCORD_GUILD_ID = "1496186723527426290";

const DISCORD_CLIENT_ID =
    process.env.DISCORD_CLIENT_ID;

const DISCORD_CLIENT_SECRET =
    process.env.DISCORD_CLIENT_SECRET;

const DISCORD_BOT_TOKEN =
    process.env.DISCORD_BOT_TOKEN;

const DISCORD_REDIRECT_URI =
    process.env.DISCORD_REDIRECT_URI;

const SESSION_SECRET =
    process.env.SESSION_SECRET;


// ==========================================
// VÉRIFICATION VARIABLES
// ==========================================

if (!DISCORD_CLIENT_ID)
    console.error("❌ DISCORD_CLIENT_ID manquant");

if (!DISCORD_CLIENT_SECRET)
    console.error("❌ DISCORD_CLIENT_SECRET manquant");

if (!DISCORD_BOT_TOKEN)
    console.error("❌ DISCORD_BOT_TOKEN manquant");

if (!DISCORD_REDIRECT_URI)
    console.error("❌ DISCORD_REDIRECT_URI manquant");

if (!SESSION_SECRET)
    console.error("❌ SESSION_SECRET manquant");


// ==========================================
// EXPRESS
// ==========================================

app.set("trust proxy", 1);

app.use(express.json());


// ==========================================
// CORS
// ==========================================

app.use(cors({
    origin: [
        "https://alphark.fr",
        "https://www.alphark.fr"
    ],
    credentials: true
}));


// ==========================================
// SESSION
// ==========================================

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


// ==========================================
// ACCUEIL API
// ==========================================

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "2.0.0"
    });

});


// ==========================================
// CONNEXION DISCORD
// ==========================================

app.get("/auth/discord", (req, res) => {

    try {

        const state =
            crypto.randomBytes(32).toString("hex");

        req.session.oauthState = state;

        const params = new URLSearchParams({

            client_id:
                DISCORD_CLIENT_ID,

            response_type:
                "code",

            redirect_uri:
                DISCORD_REDIRECT_URI,

            scope:
                "identify",

            state:
                state,

            prompt:
                "consent"
        });

        const discordUrl =
            "https://discord.com/oauth2/authorize?" +
            params.toString();

        console.log(
            "🔵 Redirection vers Discord"
        );

        console.log(
            "🔗 Redirect URI :",
            DISCORD_REDIRECT_URI
        );

        req.session.save((error) => {

            if (error) {

                console.error(
                    "❌ Erreur sauvegarde session :",
                    error
                );

                return res.status(500).send(
                    "Impossible de démarrer la connexion Discord."
                );
            }

            res.setHeader(
                "Cache-Control",
                "no-store"
            );

            res.redirect(discordUrl);

        });

    } catch (error) {

        console.error(
            "❌ Erreur connexion Discord :",
            error
        );

        res.status(500).send(
            "Erreur interne ALPHARK."
        );

    }

});


// ==========================================
// CALLBACK DISCORD
// ==========================================

app.get(
    "/auth/discord/callback",
    async (req, res) => {

        try {

            console.log(
                "=========================================="
            );

            console.log(
                "🟢 CALLBACK DISCORD REÇU"
            );

            console.log(
                "=========================================="
            );


            const code =
                req.query.code;

            const state =
                req.query.state;


            console.log(
                "Code reçu :",
                code ? "OUI" : "NON"
            );

            console.log(
                "State reçu :",
                state ? "OUI" : "NON"
            );


            if (!code) {

                return res.status(400).send(
                    "Code Discord manquant."
                );

            }


            if (
                !state ||
                state !== req.session.oauthState
            ) {

                console.error(
                    "❌ State Discord invalide"
                );

                return res.status(400).send(
                    "Connexion Discord invalide ou expirée."
                );

            }


            delete req.session.oauthState;


            // ==========================================
            // TOKEN DISCORD
            // ==========================================

            const tokenResponse =
                await fetch(
                    "https://discord.com/api/v10/oauth2/token",
                    {

                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/x-www-form-urlencoded",

                            "User-Agent":
                                "ALPHARK-API/2.0"
                        },

                        body:
                            new URLSearchParams({

                                client_id:
                                    DISCORD_CLIENT_ID,

                                client_secret:
                                    DISCORD_CLIENT_SECRET,

                                grant_type:
                                    "authorization_code",

                                code:
                                    code,

                                redirect_uri:
                                    DISCORD_REDIRECT_URI

                            })

                    }
                );


            console.log(
                "📡 Réponse token Discord :",
                tokenResponse.status
            );


            if (!tokenResponse.ok) {

                const errorText =
                    await tokenResponse.text();

                console.error(
                    "❌ Erreur token Discord :",
                    errorText
                );

                return res.status(401).send(
                    "Impossible de valider la connexion Discord."
                );

            }


            const tokenData =
                await tokenResponse.json();


            // ==========================================
            // COMPTE DISCORD
            // ==========================================

            const userResponse =
                await fetch(
                    "https://discord.com/api/v10/users/@me",
                    {

                        headers: {

                            Authorization:
                                `Bearer ${tokenData.access_token}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"

                        }

                    }
                );


            if (!userResponse.ok) {

                console.error(
                    "❌ Impossible de récupérer le compte Discord"
                );

                return res.status(401).send(
                    "Impossible de récupérer votre compte Discord."
                );

            }


            const user =
                await userResponse.json();


            console.log(
                `👤 Discord : ${user.username} (${user.id})`
            );


            // ==========================================
            // VÉRIFICATION MEMBRE ALPHARK
            // ==========================================

            const memberResponse =
                await fetch(

                    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${user.id}`,

                    {

                        headers: {

                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"

                        }

                    }

                );


            if (!memberResponse.ok) {

                if (
                    memberResponse.status === 404
                ) {

                    console.log(
                        `❌ ${user.username} n'est pas membre d'ALPHARK`
                    );

                    return res.redirect(
                        "https://www.alphark.fr/?discord=not_member"
                    );

                }


                const memberError =
                    await memberResponse.text();


                console.error(
                    "❌ Erreur vérification membre :",
                    memberError
                );


                return res.status(500).send(
                    "Impossible de vérifier votre appartenance au serveur ALPHARK."
                );

            }


            // ==========================================
            // UTILISATEUR MEMBRE ALPHARK
            // ==========================================

            console.log(
                `✅ ${user.username} est membre d'ALPHARK`
            );


            req.session.user = {

                id:
                    user.id,

                username:
                    user.global_name ||
                    user.username,

                avatar:
                    user.avatar
                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                        : `https://cdn.discordapp.com/embed/avatars/0.png`

            };


            req.session.save(
                (error) => {

                    if (error) {

                        console.error(
                            "❌ Erreur sauvegarde session :",
                            error
                        );

                        return res.status(500).send(
                            "Impossible de créer votre session."
                        );

                    }


                    console.log(
                        `🎉 Connexion ALPHARK réussie : ${user.username}`
                    );


                    res.redirect(
                        "https://www.alphark.fr/?discord=connected"
                    );

                }
            );


        } catch (error) {

            console.error(
                "❌ Erreur connexion Discord :",
                error
            );

            res.status(500).send(
                "Erreur interne ALPHARK."
            );

        }

    }
);


// ==========================================
// UTILISATEUR CONNECTÉ
// ==========================================

app.get("/api/me", (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({

            loggedIn: false

        });

    }


    res.json({

        loggedIn: true,

        user:
            req.session.user

    });

});


// ==========================================
// JOUEURS CONNECTÉS AU SITE
// ==========================================

const onlinePlayers =
    new Map();


const PRESENCE_TIMEOUT =
    5 * 60 * 1000;


// ==========================================
// PRÉSENCE
// ==========================================

app.post("/api/presence", (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({

            loggedIn: false

        });

    }


    const user =
        req.session.user;


    onlinePlayers.set(

        user.id,

        {

            id:
                user.id,

            username:
                user.username,

            avatar:
                user.avatar,

            lastSeen:
                Date.now()

        }

    );


    res.json({

        success: true

    });

});


// ==========================================
// LISTE JOUEURS CONNECTÉS
// ==========================================

app.get("/api/online", (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({

            loggedIn: false

        });

    }


    const now =
        Date.now();


    for (
        const [id, player]
        of onlinePlayers.entries()
    ) {

        if (
            now - player.lastSeen >
            PRESENCE_TIMEOUT
        ) {

            onlinePlayers.delete(id);

        }

    }


    const players =
        Array.from(
            onlinePlayers.values()
        ).map(
            player => ({

                id:
                    player.id,

                username:
                    player.username,

                avatar:
                    player.avatar

            })
        );


    res.json({

        loggedIn: true,

        players:
            players

    });

});


// ==========================================
// DERNIER PATCH DISCORD
// ==========================================
//
// Le site récupère automatiquement les messages
// des salons Discord de patchs.
//
// Ordre de recherche :
// #patch-notes
// #announcements
// puis tout salon contenant patch/announcement
//
// ==========================================

let latestPatchCache =
    null;

let latestPatchCacheTime =
    0;

const PATCH_CACHE_TIME =
    60 * 1000;


// ==========================================
// API DERNIER PATCH
// ==========================================

app.get(
    "/api/latest-patch",
    async (req, res) => {

        try {

            // ==========================================
            // CACHE 1 MINUTE
            // ==========================================

            if (
                latestPatchCache &&
                Date.now() -
                    latestPatchCacheTime <
                    PATCH_CACHE_TIME
            ) {

                return res.json(
                    latestPatchCache
                );

            }


            // ==========================================
            // RÉCUPÉRER LES SALONS DISCORD
            // ==========================================

            const channelsResponse =
                await fetch(

                    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/channels`,

                    {

                        headers: {

                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"

                        }

                    }

                );


            if (!channelsResponse.ok) {

                const errorText =
                    await channelsResponse.text();


                console.error(
                    "❌ Erreur récupération salons Discord :",
                    errorText
                );


                return res.status(500).json({

                    success: false,

                    error:
                        "Impossible de récupérer les salons Discord."

                });

            }


            const channels =
                await channelsResponse.json();


            // ==========================================
            // RECHERCHE DU SALON PATCH
            // ==========================================

            const textChannels =
                channels.filter(
                    channel =>
                        channel.type === 0
                );


            let patchChannel =
                textChannels.find(
                    channel =>
                        channel.name
                            .toLowerCase() ===
                        "patch-notes"
                );


            if (!patchChannel) {

                patchChannel =
                    textChannels.find(
                        channel =>
                            channel.name
                                .toLowerCase() ===
                            "announcements"
                    );

            }


            if (!patchChannel) {

                patchChannel =
                    textChannels.find(
                        channel =>
                            channel.name
                                .toLowerCase()
                                .includes("patch")
                    );

            }


            if (!patchChannel) {

                patchChannel =
                    textChannels.find(
                        channel =>
                            channel.name
                                .toLowerCase()
                                .includes("announcement")
                    );

            }


            if (!patchChannel) {

                console.error(
                    "❌ Aucun salon patch trouvé."
                );


                return res.status(404).json({

                    success: false,

                    error:
                        "Aucun salon patch ou annonce trouvé."

                });

            }


            console.log(
                `📢 Salon patch : #${patchChannel.name}`
            );


            // ==========================================
            // RÉCUPÉRER LES MESSAGES
            // ==========================================

            const messagesResponse =
                await fetch(

                    `https://discord.com/api/v10/channels/${patchChannel.id}/messages?limit=20`,

                    {

                        headers: {

                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"

                        }

                    }

                );


            if (!messagesResponse.ok) {

                const errorText =
                    await messagesResponse.text();


                console.error(
                    "❌ Erreur récupération messages :",
                    errorText
                );


                return res.status(500).json({

                    success: false,

                    error:
                        "Impossible de récupérer les messages Discord."

                });

            }


            const messages =
                await messagesResponse.json();


            // ==========================================
            // RECHERCHER LE DERNIER PATCH
            // ==========================================

            const patchMessage =
                messages.find(
                    message => {

                        const content =
                            message.content ||
                            "";

                        const embedTitles =
                            Array.isArray(
                                message.embeds
                            )
                                ? message.embeds
                                    .map(
                                        embed =>
                                            embed.title ||
                                            ""
                                    )
                                    .join(" ")
                                : "";


                        const embedDescriptions =
                            Array.isArray(
                                message.embeds
                            )
                                ? message.embeds
                                    .map(
                                        embed =>
                                            embed.description ||
                                            ""
                                    )
                                    .join(" ")
                                : "";


                        const text =
                            `${content} ${embedTitles} ${embedDescriptions}`;


                        return /patch|version|minor version|major version|hotfix/i.test(
                            text
                        );

                    }
                );


            if (!patchMessage) {

                return res.json({

                    success: true,

                    found: false,

                    message:
                        "Aucun patch trouvé."

                });

            }


            // ==========================================
            // EMBED
            // ==========================================

            const embed =
                patchMessage.embeds &&
                patchMessage.embeds.length > 0
                    ? patchMessage.embeds[0]
                    : null;


            // ==========================================
            // TITRE
            // ==========================================

            const title =
                embed?.title ||
                (
                    patchMessage.content
                        ? patchMessage.content
                            .split("\n")[0]
                        : "Dernier patch ALPHARK"
                );


            // ==========================================
            // DESCRIPTION
            // ==========================================

            const description =
                embed?.description ||
                patchMessage.content ||
                "";


            // ==========================================
            // IMAGE
            // ==========================================

            let image =
                null;


            // Image principale de l'embed
            if (
                embed &&
                embed.image &&
                embed.image.url
            ) {

                image =
                    embed.image.url;

            }


            // Thumbnail
            if (
                !image &&
                embed &&
                embed.thumbnail &&
                embed.thumbnail.url
            ) {

                image =
                    embed.thumbnail.url;

            }


            // Pièce jointe
            if (
                !image &&
                Array.isArray(
                    patchMessage.attachments
                )
            ) {

                const attachment =
                    patchMessage.attachments.find(
                        file => {

                            const type =
                                file.content_type ||
                                "";

                            return type.startsWith(
                                "image/"
                            );

                        }
                    );


                if (attachment) {

                    image =
                        attachment.url;

                }

            }


            // ==========================================
            // DATE
            // ==========================================

            const date =
                patchMessage.edited_timestamp ||
                patchMessage.timestamp;


            // ==========================================
            // LIEN DISCORD
            // ==========================================

            const discordUrl =
                `https://discord.com/channels/${DISCORD_GUILD_ID}/${patchChannel.id}/${patchMessage.id}`;


            // ==========================================
            // RÉSULTAT
            // ==========================================

            const result = {

                success:
                    true,

                found:
                    true,

                id:
                    patchMessage.id,

                title:
                    title,

                description:
                    description,

                image:
                    image,

                date:
                    date,

                channel:
                    patchChannel.name,

                discordUrl:
                    discordUrl

            };


            // ==========================================
            // CACHE
            // ==========================================

            latestPatchCache =
                result;

            latestPatchCacheTime =
                Date.now();


            console.log(
                "=========================================="
            );

            console.log(
                "✅ DERNIER PATCH RÉCUPÉRÉ"
            );

            console.log(
                "Titre :",
                title
            );

            console.log(
                "Image :",
                image ? "OUI" : "NON"
            );

            console.log(
                "Salon :",
                patchChannel.name
            );

            console.log(
                "=========================================="
            );


            res.json(result);


        } catch (error) {

            console.error(
                "❌ Erreur dernier patch Discord :",
                error
            );


            res.status(500).json({

                success:
                    false,

                error:
                    "Erreur interne lors de la récupération du patch."

            });

        }

    }
);


// ==========================================
// DÉCONNEXION
// ==========================================

app.get(
    "/auth/logout",
    (req, res) => {

        const userId =
            req.session.user?.id;


        if (userId) {

            onlinePlayers.delete(
                userId
            );

        }


        req.session.destroy(
            (error) => {

                if (error) {

                    console.error(
                        "❌ Erreur déconnexion :",
                        error
                    );

                    return res.status(500).send(
                        "Erreur lors de la déconnexion."
                    );

                }


                res.redirect(
                    "https://www.alphark.fr/"
                );

            }
        );

    }
);


// ==========================================
// DÉMARRAGE
// ==========================================

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 API ALPHARK démarrée sur le port ${PORT}`
        );

        console.log(
            `🌐 Port : ${PORT}`
        );

        console.log(
            `🎮 Guild ALPHARK : ${DISCORD_GUILD_ID}`
        );

        console.log(
            "📢 API patch Discord activée"
        );

    }
);
