/* =========================================================
   ALPHARK — SCRIPT.JS
   Homepage + actualités + dernier patch Discord
========================================================= */

"use strict";

const ALPHARK_API = "https://api.alphark.fr";
const PATCH_API = `${ALPHARK_API}/api/latest-patch`;

const PATCH_BROWSER_CACHE_KEY = "alphark_latest_patch";
const PATCH_BROWSER_CACHE_TIME_KEY = "alphark_latest_patch_time";
const PATCH_BROWSER_CACHE_MS = 5 * 60 * 1000;


/* =========================================================
   INITIALISATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    initCardAnimations();
    initButtonEffects();
    initActiveNavigation();
    initScrollEffects();
    initHeroAnimation();
    initShopLinks();

    loadLatestPatch();
    loadLatestNews();
    checkSession();

});


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

    const observer = new IntersectionObserver(
        entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("visible");

                    observer.unobserve(entry.target);

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
   BOUTONS
========================================================= */

function initButtonEffects() {

    document.querySelectorAll(
        ".hero-button, .top-button, .panel-button"
    ).forEach(button => {

        button.addEventListener("mouseenter", () => {
            button.classList.add("is-hovered");
        });

        button.addEventListener("mouseleave", () => {
            button.classList.remove("is-hovered");
        });

    });

}


/* =========================================================
   NAVIGATION ACTIVE
========================================================= */

function initActiveNavigation() {

    const links = document.querySelectorAll(".nav-link");

    if (!links.length) return;

    const currentPath = normalizePath(
        window.location.pathname
    );

    links.forEach(link => {

        const href = link.getAttribute("href");

        if (!href || href.startsWith("http")) return;

        const linkPath = normalizePath(
            new URL(href, window.location.href).pathname
        );

        if (linkPath === currentPath) {

            link.classList.add("active");

        }

    });

}


function normalizePath(path) {

    if (!path) return "/";

    let clean = path
        .split("?")[0]
        .split("#")[0];

    if (
        clean.length > 1 &&
        clean.endsWith("/")
    ) {
        clean = clean.slice(0, -1);
    }

    return clean || "/";

}


/* =========================================================
   HEADER AU SCROLL
========================================================= */

function initScrollEffects() {

    const header = document.querySelector(".top-header");

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

    const hero = document.querySelector(".hero");

    if (!hero) return;

    window.setTimeout(() => {

        hero.classList.add("hero-loaded");

    }, 150);

}


/* =========================================================
   BOUTIQUE
========================================================= */

function initShopLinks() {

    document.querySelectorAll(
        'a[href*="boutique.html"]'
    ).forEach(link => {

        link.addEventListener("click", () => {

            console.log(
                "🛒 Navigation vers la boutique ALPHARK"
            );

        });

    });

}


/* =========================================================
   DERNIÈRES ACTUALITÉS
========================================================= */

async function loadLatestNews() {

    const container =
        document.getElementById("latest-news-list");

    if (!container) return;

    try {

        const response = await fetch(
            "actualites.json",
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {

            throw new Error(
                `Erreur HTTP ${response.status}`
            );

        }

        const news = await response.json();

        if (
            !Array.isArray(news) ||
            !news.length
        ) {

            container.innerHTML = `
                <div class="news-empty">
                    Aucune actualité disponible pour le moment.
                </div>
            `;

            return;

        }

        container.innerHTML = "";

        news
            .slice(0, 4)
            .forEach(item => {

                const article =
                    document.createElement("article");

                article.className = "news-item";

                const tag =
                    item.tag || "ACTUALITÉ";

                const tagClass =
                    item.tagClass || "update";

                const date =
                    item.date || "";

                const title =
                    item.title || "Actualité ALPHARK";

                const text =
                    item.text || "";

                const image =
                    item.image || "images/news-1.jpg";

                article.innerHTML = `

                    <div
                        class="news-image"
                        style="
                            background-image:
                            url('${escapeHtmlAttribute(image)}');
                        "
                    ></div>

                    <div class="news-content">

                        <div class="news-meta">

                            <span class="tag ${escapeHtmlAttribute(tagClass)}">
                                ${escapeHtml(tag)}
                            </span>

                            <small>
                                ${escapeHtml(date)}
                            </small>

                        </div>

                        <h3>
                            ${escapeHtml(title)}
                        </h3>

                        <p>
                            ${escapeHtml(text)}
                        </p>

                        ${
                            item.link
                            ?
                            `<a
                                class="news-read-more"
                                href="${escapeHtmlAttribute(item.link)}"
                            >
                                En savoir plus →
                            </a>`
                            :
                            ""
                        }

                    </div>
                `;

                container.appendChild(article);

            });

        initCardAnimations();

    } catch (error) {

        console.warn(
            "⚠️ Actualités ALPHARK :",
            error.message
        );

        container.innerHTML = `
            <div class="news-empty">
                Les actualités sont temporairement indisponibles.
            </div>
        `;

    }

}


/* =========================================================
   PROTECTION HTML
========================================================= */

function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function escapeHtmlAttribute(value) {

    return escapeHtml(value);

}


/* =========================================================
   DERNIER PATCH DISCORD
========================================================= */

async function loadLatestPatch() {

    const titleElement =
        document.getElementById("latest-patch-title");

    const listElement =
        document.getElementById("latest-patch-list");

    const imageElement =
        document.getElementById("latest-patch-image");

    const linkElement =
        document.getElementById("latest-patch-link");

    if (!titleElement || !listElement) return;


    const cachedPatch =
        getBrowserPatchCache();


    if (cachedPatch) {

        renderLatestPatch(
            cachedPatch,
            titleElement,
            listElement,
            imageElement,
            linkElement
        );

    }


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


        saveBrowserPatchCache(
            data.patch
        );


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
   AFFICHAGE PATCH
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


    titleElement.textContent =
        title;


    const bullets =
        extractPatchBullets(
            patch.description || ""
        );


    listElement.innerHTML = "";


    if (bullets.length) {

        bullets.forEach(text => {

            const li =
                document.createElement("li");

            li.textContent =
                `✓ ${text}`;

            listElement.appendChild(li);

        });

    } else {

        const li =
            document.createElement("li");

        li.textContent =
            "✓ Voir les détails complets du patch sur Discord";

        listElement.appendChild(li);

    }


    if (imageElement) {

        const fallback =
            "images/patch.jpg";


        imageElement.onerror = () => {

            imageElement.onerror = null;

            imageElement.src =
                fallback;

        };


        imageElement.src =
            patch.image ||
            fallback;


        imageElement.alt =
            title;

    }


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
   EXTRACTION PATCH
========================================================= */

function extractPatchBullets(description) {

    const lines =
        String(description)
            .split(/\r?\n/)
            .map(line =>
                cleanDiscordMarkdown(
                    line.trim()
                )
            )
            .filter(Boolean);


    return lines
        .map(line =>
            line
                .replace(/^[-*•✓✔️]\s*/, "")
                .replace(/^\d+[.)]\s*/, "")
                .trim()
        )
        .filter(Boolean)
        .slice(0, 10);

}


/* =========================================================
   NETTOYAGE MARKDOWN DISCORD
========================================================= */

function cleanDiscordMarkdown(text) {

    return String(text)
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/_(.*?)_/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .replace(/~~(.*?)~~/g, "$1")
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
        "Dernier patch ALPHARK";

    listElement.innerHTML = "";

    const li =
        document.createElement("li");

    li.textContent =
        `⚠️ ${message}`;

    listElement.appendChild(li);

}


/* =========================================================
   CACHE PATCH NAVIGATEUR
========================================================= */

function saveBrowserPatchCache(patch) {

    try {

        localStorage.setItem(
            PATCH_BROWSER_CACHE_KEY,
            JSON.stringify(patch)
        );

        localStorage.setItem(
            PATCH_BROWSER_CACHE_TIME_KEY,
            String(Date.now())
        );

    } catch (error) {

        console.warn(
            "Cache patch impossible :",
            error
        );

    }

}


function getBrowserPatchCache() {

    try {

        const raw =
            localStorage.getItem(
                PATCH_BROWSER_CACHE_KEY
            );

        if (!raw) return null;

        return JSON.parse(raw);

    } catch {

        return null;

    }

}


function getBrowserPatchCacheAge() {

    try {

        const time =
            Number(
                localStorage.getItem(
                    PATCH_BROWSER_CACHE_TIME_KEY
                )
            );

        if (!time) return Infinity;

        return Date.now() - time;

    } catch {

        return Infinity;

    }

}


/* =========================================================
   SESSION DISCORD
========================================================= */

async function checkSession() {

    const loginButton =
        document.querySelector(
            ".top-button.login"
        );

    if (!loginButton) return;


    try {

        const response =
            await fetch(
                `${ALPHARK_API}/api/me`,
                {
                    credentials: "include"
                }
            );


        if (!response.ok) return;


        const data =
            await response.json();


        if (
            data.success &&
            data.connected
        ) {

            loginButton.textContent =
                "Mon espace";

            loginButton.href =
                "pages/infos.html";

        }

    } catch (error) {

        console.warn(
            "Session ALPHARK :",
            error.message
        );

    }

}
