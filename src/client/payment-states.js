/** Payment state machine for Microform flow - Phase 2 implementation */

import * as utils from "./utils.js";

// State machine for payment processing
export class PaymentFlow {
  constructor() {
    this.state = "idle"; // idle, processing, waiting-on-you, failed, success
    this.currentBookingId = null;
    this.microformInstance = null;
    this.progressElement = null;
    this.stepupContainer = null;
    this.failedContainer = null;
    this.currentMessage = "";
    this.originalOptions = {}; // Store for retry
  }

  async start(options) {
    // Store options
    this.currentBookingId = options.bookingId;
    this.microformInstance = options.microformInstance;
    this.progressElement = document.getElementById("checkout-progress-modal");
    this.stepupContainer = document.getElementById("checkout-stepup-modal");
    this.failedContainer = document.getElementById("checkout-failed-modal");

    // Store original options for retry
    this.originalOptions = { ...options };

    // Reset state
    this.setState("processing", { message: "Verifying your card securely…" });

    try {
      // Execute the full payment sequence
      await this.executePaymentSequence(options);
    } catch (error) {
      console.error("Payment flow error:", error);
      this.setState("failed", {
        message: "We couldn't verify this payment — please try again.",
        error: error.message
      });
      this.showFailedState();
    }
  }

  async executePaymentSequence(options) {
    const {
      bookingId,
      microformInstance,
      amount,
      currency,
      billTo,
      checkin,
      checkout
    } = options;

    try {
      // Step 1: Tokenize card
      this.updateProgress("Tokenizing card...");
      const token = await this.createToken();

      // Step 2: Auth setup
      this.updateProgress("Setting up payment verification...");
      const authSetup = await this.authSetup(token);

      // Step 3: DDC (Device Data Collection)
      this.updateProgress("Collecting device information...");
      await this.performDDC(authSetup.accessToken, authSetup.deviceDataCollectionUrl);

      // Step 4: Enrollment check
      this.updateProgress("Checking payment eligibility...");
      const enrollment = await this.checkEnrollment(
        token,
        authSetup.referenceId,
        amount,
        currency,
        billTo
      );

      // Step 5: Handle step-up if required
      if (enrollment.consumerAuthenticationInformation?.stepUpUrl) {
        await this.handleStepUp(enrollment);
      }

      // Step 6: Validate authentication
      this.updateProgress("Confirming your booking...");
      const validation = await this.validateAuth(
        enrollment.consumerAuthenticationInformation?.authenticationTransactionId
      );

      // Step 7: Process payment
      this.updateProgress("Processing your payment...");
      const chargeResult = await this.charge(bookingId, token, amount, currency, billTo, validation);

      // Success
      this.setState("success");
      this.redirectToConfirmation(bookingId, checkin, checkout);

    } catch (error) {
      console.error("Payment sequence error:", error);
      throw error;
    }
  }

  async createToken() {
    return new Promise((resolve, reject) => {
      // Read expiration from form if available; otherwise proceed with empty
      const expMonthEl = document.getElementById("exp-month");
      const expYearEl = document.getElementById("exp-year");
      const tokenOptions = {};
      if (expMonthEl && expMonthEl.value) tokenOptions.expirationMonth = expMonthEl.value;
      if (expYearEl && expYearEl.value) tokenOptions.expirationYear = expYearEl.value;
      this.microformInstance.createToken(tokenOptions, (err, token) => {
        if (err) reject(err);
        else resolve(token);
      });
    });
  }

  async authSetup(token) {
    const response = await fetch("/api/microform/auth-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transientToken: token })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Auth setup failed");
    }

    return response.json();
  }

  async performDDC(accessToken, ddcUrl) {
    // Hidden DDC form and iframe
    const ddcForm = document.getElementById("stepup-form");
    const ddcIframe = document.getElementById("stepup-iframe");

    ddcForm.action = ddcUrl;
    document.getElementById("stepup-jwt").value = accessToken;

    // Listen for DDC completion
    await this.waitForDDCCompletion();
  }

  async waitForDDCCompletion() {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.warn("DDC timeout reached");
          resolve(); // Continue anyway as it's not critical
        }
      }, 30000);

      function onMessage(ev) {
        if (ev.origin !== "https://centinelapi.cardinalcommerce.com") return;

        let data;
        try {
          data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        } catch (e) { return; }

        if (data && data.MessageType === "profile.completed") {
          console.log("DDC completed successfully");
          window.removeEventListener("message", onMessage);
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }
      }

      window.addEventListener("message", onMessage);
      document.getElementById("stepup-form").submit();
    });
  }

  async checkEnrollment(token, referenceId, amount, currency, billTo) {
    const response = await fetch("/api/microform/check-enrollment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transientToken: token,
        referenceId: referenceId,
        amount,
        currency,
        billTo
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Enrollment check failed");
    }

    return response.json();
  }

  async handleStepUp(enrollment) {
    const { stepUpUrl, accessToken, token } = enrollment.consumerAuthenticationInformation;

    // Store step-up data for modal
    this.stepUpUrl = stepUpUrl;
    this.accessToken = accessToken || token;

    // Set state to waiting-on-you to trigger modal show
    this.setState("waiting-on-you", {
      message: "Your bank needs to verify this payment"
    });

    // Wait for step-up completion
    return await this.waitForStepUpCompletion();
  }

  async waitForStepUpCompletion() {
    return new Promise((resolve, reject) => {
      let resolved = false;

      function onMessage(ev) {
        if (ev.origin !== "https://centinelapi.cardinalcommerce.com") return;

        let data;
        try {
          data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        } catch (e) { return; }

        if (data && data.type === "stepup-complete") {
          console.log("Step-up completed successfully");
          window.removeEventListener("message", onMessage);
          if (!resolved) {
            resolved = true;
            resolve(data);
          }
        }
      }

      window.addEventListener("message", onMessage);
      // Submit the step-up form after a brief delay to allow modal to render
      setTimeout(() => {
        const stepupForm = document.getElementById("stepup-form");
        if (stepupForm) {
          stepupForm.submit();
        }
      }, 100);
    });
  }

  async validateAuth(authenticationTransactionId) {
    if (!authenticationTransactionId) {
      return null; // No 3DS required
    }

    const response = await fetch("/api/microform/validate-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authenticationTransactionId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Authentication validation failed");
    }

    return response.json();
  }

  async charge(bookingId, token, amount, currency, billTo, validation) {
    const chargePayload = {
      bookingId,
      transientToken: token,
      amount,
      currency,
      billTo
    };

    if (validation?.consumerAuthenticationInformation) {
      chargePayload.consumerAuthenticationInformation = validation.consumerAuthenticationInformation;
    }

    const response = await fetch("/api/microform/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chargePayload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Payment failed");
    }

    return response.json();
  }

  setState(state, data = {}) {
    this.state = state;
    this.updateUI(state, data);

    switch (state) {
      case "processing":
        this.updateProgress(data.message || "Processing...");
        this.hideAllErrorStates();
        break;
      case "waiting-on-you":
        this.showStepUpContainer(data.message || "Your bank needs to verify this payment");
        break;
      case "failed":
        this.showFailedState(data.message, data.error);
        break;
      case "success":
        this.redirectToConfirmation(this.currentBookingId);
        break;
    }
  }

  updateUI(state, data) {
    // Update modal state
    const modalOverlay = document.getElementById("checkout-modal-overlay");
    const progressModal = document.getElementById("checkout-progress-modal");
    const stepupModal = document.getElementById("checkout-stepup-modal");
    const failedModal = document.getElementById("checkout-failed-modal");

    // Show/hide appropriate modal based on state
    if (state === "processing") {
      modalOverlay.classList.remove("hidden");
      modalOverlay.classList.add("active");
      progressModal.classList.remove("hidden");
      progressModal.classList.add("active");
      stepupModal.classList.add("hidden");
      failedModal.classList.add("hidden");
      this.updateProgress(data.message || "Processing...");
    } else if (state === "waiting-on-you") {
      modalOverlay.classList.remove("hidden");
      modalOverlay.classList.add("active");
      progressModal.classList.add("hidden");
      stepupModal.classList.remove("hidden");
      stepupModal.classList.add("active");
      failedModal.classList.add("hidden");
      this.showStepUpContainer(data.message || "Your bank needs to verify this payment");
    } else if (state === "failed") {
      modalOverlay.classList.remove("hidden");
      modalOverlay.classList.add("active");
      progressModal.classList.add("hidden");
      stepupModal.classList.add("hidden");
      failedModal.classList.remove("hidden");
      failedModal.classList.add("active");
      this.showFailedState(data.message, data.error);
    } else if (state === "success") {
      // Success happens via redirect, no modal shown
      this.redirectToConfirmation(this.currentBookingId);
    } else {
      // idle state - hide all modals
      modalOverlay.classList.add("hidden");
      modalOverlay.classList.remove("active");
      progressModal.classList.add("hidden");
      progressModal.classList.remove("active");
      stepupModal.classList.add("hidden");
      stepupModal.classList.remove("active");
      failedModal.classList.add("hidden");
      failedModal.classList.remove("active");
    }
  }

  updateProgress(message) {
    this.currentMessage = message;
    const progressText = document.getElementById("progress-text");
    const progressBarFill = document.getElementById("progress-bar-fill");
    if (progressText) progressText.textContent = message;
    // Simple progress animation
    if (progressBarFill) {
      progressBarFill.style.width = "60%"; // Simple indicator
    }
    console.log(`[PaymentFlow] ${message}`);
  }

  showStepUpContainer(message) {
    const stepupContainer = document.getElementById("payment-stepup");

    // Show step-up container
    stepupContainer.style.display = "block";
    stepupContainer.classList.add("active");

    // Update progress
    this.updateProgress("Verifying with your bank...");

    // Submit step-up form
    const stepUpForm = document.getElementById("stepup-form");
    if (this.stepUpUrl) {
      stepUpForm.action = this.stepUpUrl;
      document.getElementById("stepup-jwt").value = this.accessToken || this.token;
      // Wait for step-up completion
      this.waitForStepUpCompletion();
    }
  }

  showFailedState(message, error) {
    const failedModal = document.getElementById("checkout-failed-modal");
    const errorText = failedModal?.querySelector("p.error-text");
    const errorDetails = failedModal?.querySelector("p.error-details");
    const retryBtn = failedModal?.querySelector(".retry-btn");
    const editBtn = failedModal?.querySelector(".edit-btn");

    if (failedModal) {
      failedModal.classList.remove("hidden");
      failedModal.classList.add("active");

      // Update error message
      if (errorText) {
        errorText.textContent = message || "Payment failed";
      }

      if (errorDetails && error) {
        errorDetails.textContent = `Error: ${error}`;
        errorDetails.style.display = "block";
      }

      // Set up retry button
      if (retryBtn) {
        retryBtn.onclick = () => {
          failedModal.classList.add("hidden");
          failedModal.classList.remove("active");
          // Re-initialize payment flow
          this.start({
            bookingId: this.currentBookingId,
            microformInstance: this.microformInstance,
            amount: this.originalOptions.amount || "0",
            currency: this.originalOptions.currency || "USD",
            billTo: this.originalOptions.billTo || {},
            checkin: this.originalOptions.checkin,
            checkout: this.originalOptions.checkout
          });
        };
      }

      // Set up edit button
      if (editBtn) {
        editBtn.onclick = () => {
          failedModal.classList.add("hidden");
          failedModal.classList.remove("active");
          // Return to payment details (show Section B)
          const sectionB = document.getElementById("section-b");
          if (sectionB) {
            sectionB.classList.remove("hidden");
          }
        };
      }
    }
  }

  hideAllErrorStates() {
    const stepupModal = document.getElementById("checkout-stepup-modal");
    const failedModal = document.getElementById("checkout-failed-modal");

    if (stepupModal) {
      stepupModal.classList.add("hidden");
      stepupModal.classList.remove("active");
    }

    if (failedModal) {
      failedModal.classList.add("hidden");
      failedModal.classList.remove("active");
    }
  }

  redirectToConfirmation(bookingId, checkin, checkout) {
    // Build confirmation URL with bookingId and optional dates
    let url = `/confirmation?bookingId=${bookingId}`;
    if (checkin && checkout) {
      url += `&checkin=${checkin}&checkout=${checkout}`;
    }

    // Redirect
    window.location.href = url;
  }

  cancel() {
    // Cancel current payment flow
    this.state = "idle";
    this.hideAllErrorStates();
  }
}

// Export for use in checkout.js
export default PaymentFlow;