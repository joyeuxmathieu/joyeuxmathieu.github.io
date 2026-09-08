// ==========================================
// ALPHARK - SCRIPT PRINCIPAL
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    console.log("ALPHARK chargé correctement.");

    // ==========================================
    // ANIMATION DES CARTES
    // ==========================================

    const cards = document.querySelectorAll(
        ".info-card, .server-preview-card, .event-card"
    );

    const observer = new IntersectionObserver(
        (entries) => {

            entries.forEach((entry) => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("show");

                }

            });

        },
        {
            threshold: 0.12
        }
    );

    cards.forEach((card) => {

        card.classList.add("hidden");

        observer.observe(card);

    });


    // ==========================================
    // EFFET SUR LES BOUTONS
    // ==========================================

    const buttons = document.querySelectorAll(".button");

    buttons.forEach((button) => {

        button.addEventListener("mouseenter", () => {

            button.classList.add("button-hover");

        });

        button.addEventListener("mouseleave", () => {

            button.classList.remove("button-hover");

        });

    });


    // ==========================================
    // NAVIGATION
    // ==========================================

    const currentPage =
        window.location.pathname.split("/").pop();

    const navLinks =
        document.querySelectorAll(".navbar nav a");

    navLinks.forEach((link) => {

        const linkPage =
            link.getAttribute("href");

        if (!linkPage) return;

        if (
            linkPage === currentPage ||
            (
                currentPage === "" &&
                linkPage === "index.html"
            )
        ) {

            link.classList.add("active");

        }

    });


    // ==========================================
    // EFFET SCROLL NAVBAR
    // ==========================================

    const navbar =
        document.querySelector(".navbar");

    window.addEventListener("scroll", () => {

        if (!navbar) return;

        if (window.scrollY > 50) {

            navbar.classList.add("scrolled");

        } else {

            navbar.classList.remove("scrolled");

        }

    });


    // ==========================================
    // ANIMATION DU HERO
    // ==========================================

    const heroContent =
        document.querySelector(".hero-content");

    if (heroContent) {

        setTimeout(() => {

            heroContent.classList.add("hero-loaded");

        }, 150);

    }


    // ==========================================
    // PROTECTION DES LIENS BOUTIQUE
    // ==========================================

    const shopLinks =
        document.querySelectorAll(
            'a[href*="boutique.html"]'
        );

    shopLinks.forEach((link) => {

        link.addEventListener("click", (event) => {

            console.log(
                "Ouverture de la boutique ALPHARK."
            );

        });

    });


    // ==========================================
    // MESSAGE CONSOLE
    // ==========================================

    console.log(
        "ALPHARK — Interface chargée."
    );

});
