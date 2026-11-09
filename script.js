/* ========================================================================
   KINGDOM SPIRIT TECHNOLOGY — SHARED WEBSITE JAVASCRIPT
   Version 1.0 | Vanilla JavaScript | No framework required

   Responsibilities:
   - Mobile navigation open/close and accessibility state
   - Services dropdown behaviour (desktop and mobile)
   - Close menus on outside click, Escape, navigation, and resize
   - Sticky-header scroll state
   - Scroll-reveal animations with reduced-motion support
   - Automatic copyright year
   - Accessible FAQ expanded-state updates

   This file intentionally contains no placeholder alerts and no fake
   authentication, payment, enquiry-submission, or success behaviour.
   Page-specific backend/form logic will be added with the relevant pages.
   ======================================================================== */

(function () {
  "use strict";

  const ROOT = document.documentElement;
  const BODY = document.body;
  const header = document.getElementById("siteHeader");
  const menuToggle = document.getElementById("menuToggle");
  const primaryNav = document.getElementById("primaryNav");
  const servicesDropdown = document.getElementById("servicesDropdown");
  const dropdownToggle = servicesDropdown
    ? servicesDropdown.querySelector(".nav-dropdown-toggle")
    : null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileNavQuery = window.matchMedia("(max-width: 980px)");

  ROOT.classList.add("js-ready");

  /* ----------------------------------------------------------------------
     1. COPYRIGHT YEAR
     ---------------------------------------------------------------------- */
  function updateCopyrightYear() {
    const year = String(new Date().getFullYear());
    document.querySelectorAll("#currentYear, #current-year, #year").forEach(function (node) {
      node.textContent = year;
    });
  }

  /* ----------------------------------------------------------------------
     2. NAVIGATION STATE HELPERS
     ---------------------------------------------------------------------- */
  function setMenuState(isOpen) {
    if (!menuToggle || !primaryNav) return;

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu"
    );
    primaryNav.classList.toggle("is-open", isOpen);
    BODY.classList.toggle("menu-is-open", isOpen && mobileNavQuery.matches);
  }

  function setDropdownState(isOpen) {
    if (!servicesDropdown || !dropdownToggle) return;

    servicesDropdown.classList.toggle("is-open", isOpen);
    dropdownToggle.setAttribute("aria-expanded", String(isOpen));
  }

  function closeAllNavigation() {
    setDropdownState(false);
    setMenuState(false);
  }

  /* ----------------------------------------------------------------------
     3. MOBILE NAVIGATION
     ---------------------------------------------------------------------- */
  function setupMobileNavigation() {
    if (!menuToggle || !primaryNav) return;

    menuToggle.addEventListener("click", function () {
      const currentlyOpen = menuToggle.getAttribute("aria-expanded") === "true";
      setMenuState(!currentlyOpen);
      if (currentlyOpen) setDropdownState(false);
    });

    // Close the mobile menu after a visitor chooses a destination.
    primaryNav.addEventListener("click", function (event) {
      const link = event.target.closest("a");
      if (link) closeAllNavigation();
    });

    // Clicking outside the navigation closes any open menu.
    document.addEventListener("click", function (event) {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(".site-header")) closeAllNavigation();
    });

    // Escape closes the open menu and returns focus to its trigger.
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;

      const menuIsOpen = menuToggle.getAttribute("aria-expanded") === "true";
      const dropdownIsOpen = servicesDropdown && servicesDropdown.classList.contains("is-open");
      if (!menuIsOpen && !dropdownIsOpen) return;

      closeAllNavigation();
      if (menuIsOpen) menuToggle.focus();
      else if (dropdownToggle) dropdownToggle.focus();
    });

    // Reset mobile-only state when returning to the desktop layout.
    function handleBreakpointChange(event) {
      if (!event.matches) closeAllNavigation();
    }

    if (typeof mobileNavQuery.addEventListener === "function") {
      mobileNavQuery.addEventListener("change", handleBreakpointChange);
    } else if (typeof mobileNavQuery.addListener === "function") {
      mobileNavQuery.addListener(handleBreakpointChange);
    }
  }

  /* ----------------------------------------------------------------------
     4. SERVICES DROPDOWN
     ---------------------------------------------------------------------- */
  function setupServicesDropdown() {
    if (!servicesDropdown || !dropdownToggle) return;

    dropdownToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      const isOpen = servicesDropdown.classList.contains("is-open");
      setDropdownState(!isOpen);
    });

    // Keep the dropdown available to keyboard users.
    servicesDropdown.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const links = Array.from(servicesDropdown.querySelectorAll(".nav-dropdown-menu a"));
      if (!links.length) return;
      event.preventDefault();
      setDropdownState(true);

      const currentIndex = links.indexOf(document.activeElement);
      const nextIndex = event.key === "ArrowDown"
        ? (currentIndex + 1) % links.length
        : (currentIndex <= 0 ? links.length - 1 : currentIndex - 1);
      links[nextIndex].focus();
    });
  }

  /* ----------------------------------------------------------------------
     5. STICKY HEADER SCROLL STATE
     ---------------------------------------------------------------------- */
  function setupHeaderScrollState() {
    if (!header) return;

    let ticking = false;

    function updateHeader() {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
      ticking = false;
    }

    updateHeader();
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateHeader);
    }, { passive: true });
  }

  /* ----------------------------------------------------------------------
     6. SCROLL-REVEAL ANIMATIONS
     ---------------------------------------------------------------------- */
  function setupScrollReveal() {
    const revealItems = Array.from(document.querySelectorAll(".reveal"));
    if (!revealItems.length) return;

    // Reduced-motion users and older browsers see all content immediately.
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      revealItems.forEach(function (item) {
        item.classList.add("is-visible");
      });
      return;
    }

    const observer = new IntersectionObserver(function (entries, activeObserver) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        activeObserver.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: "0px 0px -45px 0px"
    });

    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  }

  /* ----------------------------------------------------------------------
     7. FAQ ACCESSIBILITY STATE
     ---------------------------------------------------------------------- */
  function setupFaqAccessibility() {
    document.querySelectorAll(".faq-item").forEach(function (item) {
      const summary = item.querySelector("summary");
      if (!summary) return;

      function syncExpandedState() {
        summary.setAttribute("aria-expanded", String(item.open));
      }

      syncExpandedState();
      item.addEventListener("toggle", syncExpandedState);
    });
  }

  /* ----------------------------------------------------------------------
     8. ANCHOR NAVIGATION POLISH
     ---------------------------------------------------------------------- */
  function setupAnchorNavigation() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        const destination = link.getAttribute("href");
        if (!destination || destination === "#") return;

        const target = document.querySelector(destination);
        if (!target) return;

        // Use native anchor behaviour, while ensuring an open mobile menu closes.
        closeAllNavigation();
      });
    });
  }

  /* ----------------------------------------------------------------------
     9. INITIALISE
     ---------------------------------------------------------------------- */
  function initialiseWebsite() {
    updateCopyrightYear();
    setupMobileNavigation();
    setupServicesDropdown();
    setupHeaderScrollState();
    setupScrollReveal();
    setupFaqAccessibility();
    setupAnchorNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseWebsite, { once: true });
  } else {
    initialiseWebsite();
  }
})();
