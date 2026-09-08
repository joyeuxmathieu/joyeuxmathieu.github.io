import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";
import { GameDig } from "gamedig";

const app = express();

const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET;
const BOT_API_KEY = process.env.ALPHARK_BOT_API_KEY;

// ============================================================
// CONFIGURATION
// ============================================================

if (!SESSION_SECRET) {
    console.error("❌ SESSION_SECRET manquant");
}

if (!BOT_API_KEY) {
    console.error("❌ ALPHARK_BOT_API_KEY manquante");
}

app.set("trust proxy", 1);

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

// ============================================================
// MAPS ALPHARK
// Query_Port = port utilisé pour interroger le serveur
// ============================================================

const ARK_SERVERS = [
    {
        name: "The Island",
        host: "213.239.204.205",
        port: 7812,
        maxPlayers: 70
    },
    {
        name: "The Center",
        host: "213.239.204.205",
        port: 7822,
        maxPlayers: 70
    },
    {
        name: "Scorched Earth",
        host: "213.239.204.205",
        port: 7832,
        maxPlayers: 70
    },
    {
        name: "Aberration",
        host: "213.239.204.205",
        port: 7842,
        maxPlayers: 70
    },
    {
        name: "Extinction",
        host: "213.239.204.205",
        port: 7852,
        maxPlayers: 70
    },
    {
        name: "La colonie perdue",
        host: "213.239.204.205",
        port: 7862,
        maxPlayers: 70
    },
    {
        name: "Amissa",
        host: "213.239.204.205",
        port: 7872,
        maxPlayers: 70
    },
    {
        name: "Ragnarok",
        host: "213.239.204.205",
        port: 7882,
        maxPlayers: 70
    },
    {
        name: "Valguero",
        host: "213.239.204.205",
        port: 7892,
        maxPlayers: 70
    },
    {
        name: "Astraeos",
        host: "213.239.204.205",
        port: 7902,
        maxPlayers: 70
    },
    {
        name: "Ragnarok EVENT",
        host: "213.239.204.205",
        port: 7802,
        maxPlayers: 70
    },
    {
        name: "Valguero EVENT",
        host: "213.239.204.205",
        port: 7962,
        maxPlayers: 70
    }
];

// ============================================================
// CODES DE CONNEXION
// ============================================================

const loginCodes = new Map();

const LOGIN_CODE_TIMEOUT = 10 * 60 * 1000;

function generateLoginCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < 6; i++) {

        code += chars[
            Math.floor(
                Math.random() * chars.length
            )
        ];

    }

    return code;
}

setInterval(() => {

    const now = Date.now();

    for (const [code, login] of loginCodes.entries()) {

        if (
            now - login.createdAt >
            LOGIN_CODE_TIMEOUT
        ) {

            loginCodes.delete(code);

        }

    }

}, 60 * 1000);

// ============================================================
// ACCUEIL
// ============================================================

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "2.1.0"
    });

});

// ============================================================
// GENERER CODE
// ============================================================

app.get("/auth/code/start", (req, res) => {

    let code;

    do {
        code = generateLoginCode();
    } while (loginCodes.has(code));

    loginCodes.set(code, {

        createdAt: Date.now(),

        status: "pending",

        discordId: null,

        username: null,

        avatar: null

    });

    req.session.loginCode = code;

    req.session.save((error) => {

        if (error) {

            console.error(
                "❌ Erreur sauvegarde session code :",
                error
            );

            return res.status(500).json({
                success: false
            });

        }

        console.log(
            `🔐 Nouveau code site : ${code}`
        );

        res.json({

            success: true,

            code: code,

            expiresIn:
                LOGIN_CODE_TIMEOUT / 1000

        });

    });

});

// ============================================================
// STATUT DU CODE
// ============================================================

app.get("/auth/code/status", (req, res) => {

    const code =
        req.session.loginCode;

    if (!code) {

        return res.json({

            success: false,

            status: "none"

        });

    }

    const login =
        loginCodes.get(code);

    if (!login) {

        return res.json({

            success: false,

            status: "expired"

        });

    }

    if (
        login.status ===
        "verified"
    ) {

        req.session.user = {

            id:
                login.discordId,

            username:
                login.username,

            avatar:
                login.avatar

        };

        loginCodes.delete(code);

        delete req.session.loginCode;

        return req.session.save(
            (error) => {

                if (error) {

                    console.error(
                        "❌ Erreur session finale :",
                        error
                    );

                    return res.status(500).json({
                        success: false
                    });

                }

                console.log(
                    `✅ Connexion site : ${login.username}`
                );

                res.json({

                    success: true,

                    status: "connected",

                    loggedIn: true,

                    user:
                        req.session.user

                });

            }
        );

    }

    res.json({

        success: true,

        status:
            login.status,

        loggedIn: false

    });

});

// ============================================================
// VALIDATION PAR BOT STARTER
// ============================================================

app.post("/auth/code/verify", (req, res) => {

    if (
        !BOT_API_KEY ||
        req.headers["x-alphark-bot-key"] !==
            BOT_API_KEY
    ) {

        console.error(
            "❌ Tentative API bot non autorisée"
        );

        return res.status(401).json({

            success: false,

            error: "Unauthorized"

        });

    }

    const {
        code,
        guild_id,
        discord_id,
        username,
        global_name,
        avatar
    } = req.body;

    // Vérification du serveur ALPHARK
    if (
        String(guild_id || "") !==
        "1496186723527426290"
    ) {

        return res.status(403).json({

            success: false,

            error:
                "Serveur Discord non autorisé"

        });

    }

    if (!code || !discord_id) {

        return res.status(400).json({

            success: false,

            error:
                "Données manquantes"

        });

    }

    // Accepte aussi espaces et tirets
    const cleanCode =
        String(code)
            .replace(/[\s-]/g, "")
            .toUpperCase();

    const login =
        loginCodes.get(cleanCode);

    if (!login) {

        return res.status(404).json({

            success: false,

            error:
                "Code expiré ou inexistant"

        });

    }

    if (
        login.status ===
        "verified"
    ) {

        return res.status(409).json({

            success: false,

            error:
                "Code déjà utilisé"

        });

    }

    login.status =
        "verified";

    login.discordId =
        String(discord_id);

    login.username =
        global_name ||
        username ||
        "Joueur ALPHARK";

    login.avatar =
        avatar ||
        "https://cdn.discordapp.com/embed/avatars/0.png";

    console.log(
        `✅ Code ${cleanCode} validé par ${login.username}`
    );

    res.json({

        success: true,

        message:
            "Connexion validée"

    });

});

// ============================================================
// UTILISATEUR CONNECTÉ
// ============================================================

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

// ============================================================
// JOUEURS CONNECTÉS
// ============================================================

const onlinePlayers =
    new Map();

const PRESENCE_TIMEOUT =
    5 * 60 * 1000;

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

app.get("/api/online", (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({

            loggedIn: false

        });

    }

    const now =
        Date.now();

    for (
        const [
            id,
            player
        ]
        of onlinePlayers.entries()
    ) {

        if (
            now -
            player.lastSeen >
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

        players

    });

});

// ============================================================
// STATUT SERVEURS ARK ASA
// ============================================================

app.get("/api/servers", async (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({

            loggedIn: false

        });

    }

    const servers =
        await Promise.all(

            ARK_SERVERS.map(
                async (server) => {

                    try {

                        const state =
                            await GameDig.query({

                                type:
                                    "asa",

                                host:
                                    server.host,

                                port:
                                    server.port,

                                givenPortOnly:
                                    true,

                                socketTimeout:
                                    4000,

                                attemptTimeout:
                                    8000,

                                maxRetries:
                                    1

                            });

                        const players =
                            Number(
                                state.numplayers || 0
                            );

                        const maxPlayers =
                            Number(
                                state.maxplayers
                            ) ||
                            server.maxPlayers;

                        console.log(
                            `🟢 ${server.name} : ${players}/${maxPlayers} | QueryPort ${server.port}`
                        );

                        return {

                            name:
                                server.name,

                            online:
                                true,

                            players:

                                players,

                            maxPlayers:

                                maxPlayers,

                            ping:

                                Number(
                                    state.ping || 0
                                ),

                            queryPort:

                                server.port

                        };

                    } catch (error) {

                        console.log(
                            `🔴 ${server.name} | QueryPort ${server.port} | ${
                                error?.message ||
                                "requête impossible"
                            }`
                        );

                        return {

                            name:
                                server.name,

                            online:
                                false,

                            players:
                                0,

                            maxPlayers:
                                server.maxPlayers,

                            ping:
                                null,

                            queryPort:
                                server.port

                        };

                    }

                }
            )

        );

    res.json({

        loggedIn:
            true,

        servers,

        online:
            servers.filter(
                server =>
                    server.online
            ).length,

        total:
            servers.length,

        updatedAt:
            new Date().toISOString()

    });

});

// ============================================================
// DECONNEXION
// ============================================================

app.get("/auth/logout", (req, res) => {

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

});

// ============================================================
// DEMARRAGE
// ============================================================

app.listen(PORT, () => {

    console.log(
        `🚀 API ALPHARK démarrée sur le port ${PORT}`
    );

    console.log(
        "🔐 Connexion par code : ACTIVE"
    );

    console.log(
        "👥 Joueurs connectés : ACTIVE"
    );

    console.log(
        `🦖 ${ARK_SERVERS.length} maps configurées`
    );

    console.log(
        "📡 QueryPorts configurés"
    );

});
