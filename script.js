/* =========================================================
   ALPHARK — SCRIPT.JS
   Site + dernier patch Discord
========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    initCardAnimations();
    initButtonEffects();
    initActiveNavigation();
    initScrollEffects();
    initHeroAnimation();
    initShopLinks();
    loadLatestPatch();
    checkSession();
});

/* =========================================================
   CONFIGURATION API
========================================================= */

const ALPHARK_API = "https://api.alphark.fr";
const PATCH_API = `${ALPHARK_API}/api/latest-patch`;

const PATCH_BROWSER_CACHE_KEY =
    "alphark_latest_patch";

const PATCH_BROWSER_CACHE_TIME_KEY =
    "alphark_latest_patch_time";

const PATCH_BROWSER_CACHE_MS =
    5 * 60 * 1000;


/* =========================================================
   ANIMATIONS DES CARTES
========================================================= */

function initCardAnimations() {

    const cards = document.querySelectorAll(
        ".stat-card, .panel, .map-card, .quick-card, .news-item"
    );

    if (!cards.length) return;

    if (!("IntersectionObserver" in window)) {

        cards.forEach(card => {
            card.classList.add("visible");
        });

        return;
    }

    const observer =
        new IntersectionObserver(
            entries => {

                entries.forEach(entry => {

                    if (entry.isIntersecting) {

                        entry.target.classList.add(
                            "visible"
                        );

                        observer.unobserve(
                            entry.target
                        );
                    }

                });

            },
            {
                threshold: 0.08
            }
        );

    cards.forEach(card => {
        observer.observe(card);
    });
}


/* =========================================================
   EFFET BOUTONS
========================================================= */

function initButtonEffects() {

    const buttons = document.querySelectorAll(
        ".hero-button, .top-button, .panel-button"
    );

    buttons.forEach(button => {

        button.addEventListener(
            "mouseenter",
            () => {
                button.classList.add(
                    "is-hovered"
                );
            }
        );

        button.addEventListener(
            "mouseleave",
            () => {
                button.classList.remove(
                    "is-hovered"
                );
            }
        );

    });
}


/* =========================================================
   NAVIGATION ACTIVE
========================================================= */

function initActiveNavigation() {

    const links =
        document.querySelectorAll(
            ".nav-link"
        );

    if (!links.length) return;

    const currentPath =
        normalizePath(
            window.location.pathname
        );

    links.forEach(link => {

        const href =
            link.getAttribute("href");

        if (
            !href ||
            href.startsWith("http")
        ) {
            return;
        }

        const linkPath =
            normalizePath(
                new URL(
                    href,
                    window.location.href
                ).pathname
            );

        if (
            linkPath === currentPath
        ) {
            link.classList.add(
                "active"
            );
        }

    });
}


function normalizePath(path) {

    if (!path) {
        return "/";
    }

    let clean =
        path
            .split("?")[0]
            .split("#")[0];

    if (
        clean.length > 1 &&
        clean.endsWith("/")
    ) {
        clean =
            clean.slice(
                0,
                -1
            );
    }

    return clean || "/";
}


/* =========================================================
   HEADER AU SCROLL
========================================================= */

function initScrollEffects() {

    const header =
        document.querySelector(
            ".top-header"
        );

    if (!header) return;

    const updateHeader = () => {

        header.classList.toggle(
            "scrolled",
            window.scrollY > 20
        );

    };

    updateHeader();

    window.addEventListener(
        "scroll",
        updateHeader,
        {
            passive: true
        }
    );
}


/* =========================================================
   HERO
========================================================= */

function initHeroAnimation() {

    const hero =
        document.querySelector(
            ".hero"
        );

    if (!hero) return;

    window.setTimeout(
        () => {
            hero.classList.add(
                "hero-loaded"
            );
        },
        150
    );
}


/* =========================================================
   BOUTIQUE
========================================================= */

function initShopLinks() {

    const shopLinks =
        document.querySelectorAll(
            'a[href*="boutique.html"]'
        );

    shopLinks.forEach(link => {

        link.addEventListener(
            "click",
            () => {

                console.log(
                    "🛒 Navigation vers la boutique ALPHARK"
                );

            }
        );

    });
}


/* =========================================================
   DERNIER PATCH DISCORD
========================================================= */

async function loadLatestPatch() {

    const titleElement =
        document.getElementById(
            "latest-patch-title"
        );

    const listElement =
        document.getElementById(
            "latest-patch-list"
        );

    const imageElement =
        document.getElementById(
            "latest-patch-image"
        );

    const linkElement =
        document.getElementById(
            "latest-patch-link"
        );

    if (
        !titleElement ||
        !listElement
    ) {
        return;
    }


    /*
     * Cache navigateur
     */

    const cachedPatch =
        getBrowserPatchCache();


    /*
     * Affichage immédiat du cache
     */

    if (cachedPatch) {

        renderLatestPatch(
            cachedPatch,
            titleElement,
            listElement,
            imageElement,
            linkElement
        );

    }


    /*
     * Si le cache est encore récent,
     * on ne contacte pas l'API.
     */

    if (
        getBrowserPatchCacheAge() <
        PATCH_BROWSER_CACHE_MS
    ) {
        return;
    }


    try {

        const response =
            await fetch(
                PATCH_API,
                {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store"
                }
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.error ||
                "Impossible de récupérer le dernier patch."
            );

        }


        if (!data.patch) {

            renderPatchError(
                titleElement,
                listElement,
                "Aucun patch disponible pour le moment."
            );

            return;
        }


        /*
         * Sauvegarde du patch
         */

        saveBrowserPatchCache(
            data.patch
        );


        /*
         * Affichage
         */

        renderLatestPatch(
            data.patch,
            titleElement,
            listElement,
            imageElement,
            linkElement
        );


    } catch (error) {

        console.warn(
            "⚠️ Dernier patch ALPHARK :",
            error.message
        );


        /*
         * Si on possède déjà
         * un ancien patch,
         * on le garde affiché.
         */

        if (!cachedPatch) {

            renderPatchError(
                titleElement,
                listElement,
                "Les notes de patch sont temporairement indisponibles."
            );

        }

    }
}


/* =========================================================
   AFFICHAGE DU PATCH
========================================================= */

function renderLatestPatch(
    patch,
    titleElement,
    listElement,
    imageElement,
    linkElement
) {

    const title =
        cleanDiscordMarkdown(
            patch.title ||
            "Dernier patch ALPHARK"
        );


    /*
     * Titre
     */

    titleElement.textContent =
        title;


    /*
     * Récupération des lignes
     */

    const bullets =
        extractPatchBullets(
            patch.description || ""
        );


    listElement.innerHTML =
        "";


    if (bullets.length) {

        bullets.forEach(
            text => {

                const li =
                    document.createElement(
                        "li"
                    );

                li.textContent =
                    `✓ ${text}`;

                listElement.appendChild(
                    li
                );

            }
        );

    } else {

        const li =
            document.createElement(
                "li"
            );

        li.textContent =
            "✓ Voir les détails complets du patch sur Discord";

        listElement.appendChild(
            li
        );

    }


    /*
     * Image
     */

    if (imageElement) {

        const fallback =
            "images/patch.jpg";


        imageElement.onerror =
            () => {

                imageElement.onerror =
                    null;

                imageElement.src =
                    fallback;

            };


        imageElement.src =
            patch.image ||
            fallback;


        imageElement.alt =
            title;
    }


    /*
     * Lien Discord
     */

    if (linkElement) {

        if (patch.url) {

            linkElement.href =
                patch.url;

            linkElement.target =
                "_blank";

            linkElement.rel =
                "noopener noreferrer";

            linkElement.textContent =
                "Voir le patch complet →";

        } else {

            linkElement.href =
                "pages/infos.html";

            linkElement.textContent =
                "Voir tous les patchs →";

        }

    }

}


/* =========================================================
   EXTRACTION DES LIGNES DU PATCH
========================================================= */

function extractPatchBullets(
    description
) {

    const lines =
        String(description)
            .split(/\r?\n/)
            .map(
                line =>
                    cleanDiscordMarkdown(
                        line.trim()
                    )
            )
            .filter(Boolean);


    return lines
        .filter(
            line =>
                line.startsWith("- ")
        )
        .map(
            line =>
                line.slice(2).trim()
        )
        .filter(
            line => {

                const lower =
                    line.toLowerCase();

                return (
                    !lower.startsWith("@steam") &&
                    !lower.startsWith("@xbox") &&
                    !lower.startsWith("@playstation") &&
                    !lower.startsWith("@windows")
                );

            }
        )
        .slice(0, 8);
}


/* =========================================================
   NETTOYAGE MARKDOWN DISCORD
========================================================= */

function cleanDiscordMarkdown(
    text
) {

    return String(text)
        .replace(
            /\*\*(.*?)\*\*/g,
            "$1"
        )
        .replace(
            /__(.*?)__/g,
            "$1"
        )
        .replace(
            /`(.*?)`/g,
            "$1"
        )
        .trim();

}


/* =========================================================
   ERREUR PATCH
========================================================= */

function renderPatchError(
    titleElement,
    listElement,
    message
) {

    titleElement.textContent =
        "DERNIER PATCH";


    listElement.innerHTML =
        "";


    const li =
        document.createElement(
            "li"
        );


    li.textContent =
        `⚠️ ${message}`;


    listElement.appendChild(
        li
    );
}


/* =========================================================
   CACHE NAVIGATEUR
========================================================= */

function saveBrowserPatchCache(
    patch
) {

    try {

        localStorage.setItem(
            PATCH_BROWSER_CACHE_KEY,
            JSON.stringify(patch)
        );


        localStorage.setItem(
            PATCH_BROWSER_CACHE_TIME_KEY,
            String(Date.now())
        );

    } catch {

        /*
         * Si localStorage est indisponible,
         * le site continue normalement.
         */

    }

}


function getBrowserPatchCache() {

    try {

        const raw =
            localStorage.getItem(
                PATCH_BROWSER_CACHE_KEY
            );


        if (!raw) {
            return null;
        }


        return JSON.parse(raw);

    } catch {

        return null;

    }

}


function getBrowserPatchCacheAge() {

    try {

        const rawTime =
            localStorage.getItem(
                PATCH_BROWSER_CACHE_TIME_KEY
            );


        if (!rawTime) {
            return Infinity;
        }


        const timestamp =
            Number(rawTime);


        if (
            !Number.isFinite(
                timestamp
            )
        ) {
            return Infinity;
        }


        return (
            Date.now() -
            timestamp
        );

    } catch {

        return Infinity;

    }

}


/* =========================================================
   SESSION DISCORD
========================================================= */

async function checkSession() {

    const loginButton =
        document.getElementById(
            "login-button"
        );


    if (!loginButton) {
        return;
    }


    try {

        const response =
            await fetch(
                `${ALPHARK_API}/api/session`,
                {
                    credentials:
                        "include",

                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {
            return;
        }


        const data =
            await response.json();


        if (
            data.connected &&
            data.user
        ) {

            const displayName =
                data.user.global_name ||
                data.user.username ||
                "Membre";


            loginButton.textContent =
                `👤 ${displayName}`;


            loginButton.href =
                "pages/infos.html";


            loginButton.title =
                "Compte Discord connecté";

        }

    } catch (error) {

        console.warn(
            "⚠️ Session ALPHARK indisponible :",
            error.message
        );

    }

}


/* =========================================================
   CONSOLE
========================================================= */

console.log(
    "🦖 ALPHARK — site chargé"
);

console.log(
    "📢 Connexion automatique au dernier patch Discord activée"
);
