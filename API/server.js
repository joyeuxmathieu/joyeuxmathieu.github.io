import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";

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

// ==========================================
// ACCUEIL API
// ==========================================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "1.1.1"
    });
});

// ==========================================
// CONNEXION DISCORD
// ==========================================

app.get("/auth/discord", (req, res) => {

    const state = crypto.randomBytes(32).toString("hex");

    req.session.oauthState = state;

    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        response_type: "code",
        redirect_uri: DISCORD_REDIRECT_URI,
        scope: "identify",
        state: state,
        prompt: "consent"
    });

    console.log("🔵 Connexion Discord lancée");
    console.log("🔗 Redirect URI :", DISCORD_REDIRECT_URI);

    res.redirect(
        "https://discord.com/oauth2/authorize?" +
        params.toString()
    );
});

// ==========================================
// CALLBACK DISCORD
// ==========================================

app.get("/auth/discord/callback", async (req, res) => {

    try {

        console.log("==========================================");
        console.log("🟢 CALLBACK DISCORD");
        console.log("==========================================");

        const code = req.query.code;
        const state = req.query.state;

        console.log("Code reçu :", code ? "OUI" : "NON");
        console.log("State reçu :", state ? "OUI" : "NON");

        if (!code) {
            console.error("❌ Aucun code Discord");
            return res.status(400).send(
                "Code Discord manquant."
            );
        }

        if (!state || state !== req.session.oauthState) {

            console.error("❌ State Discord invalide");

            return res.status(400).send(
                "Connexion Discord invalide ou expirée."
            );
        }

        delete req.session.oauthState;

        // ==========================================
        // TOKEN DISCORD
        // ==========================================

        console.log("🔄 Demande du token Discord...");

        const tokenResponse = await fetch(
            "https://discord.com/api/v10/oauth2/token",
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

        console.log(
            "📡 Réponse Discord token :",
            tokenResponse.status
        );

        if (!tokenResponse.ok) {

            const errorText =
                await tokenResponse.text();

            console.error(
                "❌ DISCORD TOKEN ERROR :",
                errorText
            );

            return res.status(401).send(
                "Impossible de valider la connexion Discord."
            );
        }

        const tokenData =
            await tokenResponse.json();

        console.log("✅ Token Discord récupéré");

        // ==========================================
        // COMPTE DISCORD
        // ==========================================

        const userResponse = await fetch(
            "https://discord.com/api/v10/users/@me",
            {
                headers: {
                    Authorization:
                        `Bearer ${tokenData.access_token}`
                }
            }
        );

        console.log(
            "📡 Réponse compte Discord :",
            userResponse.status
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

        const memberResponse = await fetch(
            `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${user.id}`,
            {
                headers: {
                    Authorization:
                        `Bot ${DISCORD_BOT_TOKEN}`
                }
            }
        );

        console.log(
            "📡 Réponse membre ALPHARK :",
            memberResponse.status
        );

        if (!memberResponse.ok) {

            if (memberResponse.status === 404) {

                console.log(
                    `❌ ${user.username} n'est pas membre d'ALPHARK`
                );

                return res.redirect(
                    "https://www.alphark.fr/?discord=not_member"
                );
            }

            const errorText =
                await memberResponse.text();

            console.error(
                "❌ Erreur membre ALPHARK :",
                errorText
            );

            return res.status(500).send(
                "Impossible de vérifier votre appartenance au serveur ALPHARK."
            );
        }

        // ==========================================
        // SESSION UTILISATEUR
        // ==========================================

        req.session.user = {
            id: user.id,
            username:
                user.global_name ||
                user.username,
            avatar:
                user.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                    : "https://cdn.discordapp.com/embed/avatars/0.png"
        };

        req.session.save((error) => {

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
        });

    } catch (error) {

        console.error(
            "❌ ERREUR CALLBACK DISCORD :",
            error
        );

        res.status(500).send(
            "Erreur interne ALPHARK."
        );
    }
});

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
        user: req.session.user
    });
});

// ==========================================
// JOUEURS CONNECTÉS AU SITE
// ==========================================

const onlinePlayers = new Map();

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
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            lastSeen: Date.now()
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
        ).map(player => ({
            id: player.id,
            username: player.username,
            avatar: player.avatar
        }));

    res.json({
        loggedIn: true,
        players
    });
});

// ==========================================
// DÉCONNEXION
// ==========================================

app.get("/auth/logout", (req, res) => {

    const userId =
        req.session.user?.id;

    if (userId) {
        onlinePlayers.delete(userId);
    }

    req.session.destroy((error) => {

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
    });
});

// ==========================================
// DÉMARRAGE
// ==========================================

app.listen(PORT, () => {

    console.log(
        `🚀 API ALPHARK démarrée sur le port ${PORT}`
    );

});
