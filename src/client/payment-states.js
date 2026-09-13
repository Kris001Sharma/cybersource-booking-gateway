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
    this.progressElement = document.getElementById("payment-progress");
    this.stepupContainer = document.getElementById("payment-stepup");
    this.failedContainer = document.getElementById("payment-failed");

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
    const ddcForm = document.getElementById("payment-stepup-form");
    const ddcIframe = document.getElementById("payment-stepup-iframe");

    ddcForm.action = ddcUrl;
    document.getElementById("payment-stepup-jwt").value = accessToken;

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
      document.getElementById("payment-stepup-form").submit();
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
    const stepupContainer = document.getElementById("payment-stepup");

    // Show step-up container
    stepupContainer.style.display = "block";
    stepupContainer.classList.add("active");

    // Update progress
    this.updateProgress("Verifying with your bank...");

    // Submit step-up form
    const stepUpForm = document.getElementById("stepup-form");
    stepUpForm.action = stepUpUrl;
    document.getElementById("stepup-jwt").value = accessToken || token;

    // Wait for step-up completion
    const stepUpData = await this.waitForStepUpCompletion();

    // Hide step-up container
    stepupContainer.style.display = "none";
    stepupContainer.classList.remove("active");

    return stepUpData;
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
      document.getElementById("stepup-form").submit();
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
    // Update progress bar state
    this.progressElement.className = `progress-bar ${state}`;
    this.progressElement.dataset.state = state;

    // Update visual indicators
    if (state === "processing") {
      this.progressElement.style.display = "block";
    }
  }

  updateProgress(message) {
    this.currentMessage = message;
    this.progressElement.textContent = message;
    console.log(`[PaymentFlow] ${message}`);
  }

  showStepUpContainer(message) {
    this.stepupContainer.style.display = "block";
    this.stepupContainer.classList.add("active");

    // Update message if provided
    if (message) {
      const stepUpMessage = this.stepupContainer.querySelector("p");
      if (stepUpMessage) {
        stepUpMessage.textContent = message;
      }
    }
  }

  showFailedState(message, error) {
    this.failedContainer.style.display = "block";
    this.failedContainer.classList.add("active");

    // Update error message
    const errorMessage = this.failedContainer.querySelector("p.error-text");
    const errorDetails = this.failedContainer.querySelector("p.error-details");

    if (errorMessage) {
      errorMessage.textContent = message || "Payment failed";
    }

    if (errorDetails && error) {
      errorDetails.textContent = `Error: ${error}`;
      errorDetails.style.display = "block";
    }

    // Set up retry button
    const retryButton = this.failedContainer.querySelector(".retry-btn");
    if (retryButton) {
      retryButton.onclick = () => {
        this.failedContainer.style.display = "none";
        this.failedContainer.classList.remove("active");
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
    const editButton = this.failedContainer.querySelector(".edit-btn");
    if (editButton) {
      editButton.onclick = () => {
        this.failedContainer.style.display = "none";
        this.failedContainer.classList.remove("active");
        // Return to payment details (show Section B)
        const sectionB = document.getElementById("section-b");
        if (sectionB) {
          sectionB.classList.remove("hidden");
        }
      };
    }
  }

  hideAllErrorStates() {
    this.stepupContainer.style.display = "none";
    this.stepupContainer.classList.remove("active");
    this.failedContainer.style.display = "none";
    this.failedContainer.classList.remove("active");
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