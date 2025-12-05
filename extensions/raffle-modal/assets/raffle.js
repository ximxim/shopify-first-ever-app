/**
 * Raffle Modal - Interactive discount raffle for storefront
 */
(function () {
  "use strict";

  // Configuration
  const config = window.RaffleModalConfig || {
    proxyUrl: "/apps/raffle",
    cartUpdateUrl: "/cart/update.js",
  };

  // DOM Elements
  let elements = {};

  // State
  let state = {
    isOpen: false,
    isLoading: false,
    hasPlayed: false,
    discountAmount: null,
  };

  /**
   * Initialize the raffle modal
   */
  function init() {
    // Get DOM elements
    elements = {
      container: document.getElementById("raffle-modal-container"),
      bubble: document.getElementById("raffle-bubble"),
      modal: document.getElementById("raffle-modal"),
      closeBtn: document.getElementById("raffle-close"),
      tryLuckBtn: document.getElementById("raffle-try-luck"),
      retryBtn: document.getElementById("raffle-retry"),
      continueBtn: document.getElementById("raffle-continue"),
      discountValue: document.getElementById("raffle-discount-value"),
      states: {
        initial: document.getElementById("raffle-initial"),
        loading: document.getElementById("raffle-loading"),
        success: document.getElementById("raffle-success"),
        error: document.getElementById("raffle-error"),
      },
    };

    // Check if elements exist
    if (!elements.bubble || !elements.modal) {
      console.warn("Raffle Modal: Required elements not found");
      return;
    }

    // Check if already played (stored in sessionStorage)
    const storedDiscount = sessionStorage.getItem("raffle_discount");
    if (storedDiscount) {
      state.hasPlayed = true;
      state.discountAmount = parseInt(storedDiscount, 10);
    }

    // Bind events
    bindEvents();
  }

  /**
   * Bind all event listeners
   */
  function bindEvents() {
    // Bubble click
    elements.bubble.addEventListener("click", toggleModal);

    // Close button
    elements.closeBtn.addEventListener("click", closeModal);

    // Backdrop click
    elements.modal
      .querySelector(".raffle-modal__backdrop")
      .addEventListener("click", closeModal);

    // Try luck button
    elements.tryLuckBtn.addEventListener("click", tryLuck);

    // Retry button
    if (elements.retryBtn) {
      elements.retryBtn.addEventListener("click", () => {
        showState("initial");
      });
    }

    // Continue shopping button
    if (elements.continueBtn) {
      elements.continueBtn.addEventListener("click", closeModal);
    }

    // ESC key to close
    document.addEventListener("keydown", handleKeyDown);
  }

  /**
   * Handle keydown events
   */
  function handleKeyDown(event) {
    if (event.key === "Escape" && state.isOpen) {
      closeModal();
    }
  }

  /**
   * Toggle modal open/close
   */
  function toggleModal() {
    if (state.isOpen) {
      closeModal();
    } else {
      openModal();
    }
  }

  /**
   * Open the modal
   */
  function openModal() {
    state.isOpen = true;
    elements.modal.setAttribute("aria-hidden", "false");
    elements.bubble.setAttribute("aria-expanded", "true");

    // Show appropriate state
    if (state.hasPlayed && state.discountAmount) {
      elements.discountValue.textContent = state.discountAmount;
      showState("success");
    } else {
      showState("initial");
    }

    // Prevent body scroll
    document.body.style.overflow = "hidden";

    // Focus trap - focus close button
    setTimeout(() => {
      elements.closeBtn.focus();
    }, 100);
  }

  /**
   * Close the modal
   */
  function closeModal() {
    state.isOpen = false;
    elements.modal.setAttribute("aria-hidden", "true");
    elements.bubble.setAttribute("aria-expanded", "false");

    // Restore body scroll
    document.body.style.overflow = "";

    // Return focus to bubble
    elements.bubble.focus();
  }

  /**
   * Show a specific state
   */
  function showState(stateName) {
    Object.entries(elements.states).forEach(([name, element]) => {
      if (element) {
        element.setAttribute(
          "aria-hidden",
          name !== stateName ? "true" : "false",
        );
      }
    });
  }

  /**
   * Handle "Try my luck" button click
   */
  async function tryLuck() {
    if (state.isLoading) return;

    state.isLoading = true;

    // Add loading state to button
    elements.tryLuckBtn.classList.add("raffle-modal__button--loading");

    // Show loading state
    showState("loading");

    try {
      // Call app proxy endpoint
      const discount = await fetchRaffleDiscount();

      // Update cart attributes
      await updateCartAttribute(discount);

      // Store in session
      sessionStorage.setItem("raffle_discount", discount.toString());

      // Update state
      state.hasPlayed = true;
      state.discountAmount = discount;

      // Update discount display
      elements.discountValue.textContent = discount;

      // Show success state
      showState("success");
    } catch (error) {
      console.error("Raffle Modal: Error", error);
      showState("error");
    } finally {
      state.isLoading = false;
      elements.tryLuckBtn.classList.remove("raffle-modal__button--loading");
    }
  }

  /**
   * Fetch discount from app proxy
   */
  async function fetchRaffleDiscount() {
    const response = await fetch(config.proxyUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Handle discount as either number or string
    const discount = parseInt(data.discount, 10);

    if (isNaN(discount)) {
      throw new Error("Invalid response: discount not found or invalid");
    }

    return discount;
  }

  /**
   * Update cart attribute with discount amount
   */
  async function updateCartAttribute(discount) {
    const formData = new FormData();
    formData.append("attributes[raffle_discount_amount]", discount.toString());

    const response = await fetch(config.cartUpdateUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to update cart: ${response.status}`);
    }

    // Cart update was successful - we don't need the response data
    // Just return true to indicate success
    return true;
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
