/** Checkout page — Phase 1: Cart review + guest details + session creation + card mounting */

import * as cart from "../client/cart.js";
import * as utils from "../client/utils.js";
import { injectThemeCSS } from "../client/theme.js";

// DOM elements cache
const elements = {};
let microformInstance = null;
let currentBookingId = null;
let currentQuote = null;
let currentSkus = [];

// Initialize the page
export async function renderPage(url) {
  // The Worker serves this page as an inline template; keep all checkout CSS
  // injected from JavaScript rather than relying on a static stylesheet.
  applyDesignTokens();

  // Read URL parameters first
  const params = new URLSearchParams(url.search);
  currentSkus = (params.get("items") || "").split(",").map(s => s.trim()).filter(Boolean);
  const skus = currentSkus;

  // Check for empty cart
  if (!skus.length) {
    showEmptyCartState();
    return;
  }

  // Fetch initial quote
  let quote;
  try {
    quote = await cart.fetchQuote(skus);
  } catch (error) {
    console.error("Failed to fetch quote:", error);
    showErrorState("Failed to load pricing information");
    return;
  }

  // Store quote for event handlers
  currentQuote = quote;

  // Render the page (inserts HTML)
  renderPageContent(skus, quote);

  // Cache DOM elements after HTML insertion
  cacheDomElements();

  // Render cart items only after the element cache has been populated.
  renderCartItems(quote.items);

  // Set up event listeners
  setupEventListeners();
}

function cacheDomElements() {
  // Section A elements (always visible)
  elements.sectionA = document.getElementById("section-a");
  elements.cartItems = document.getElementById("cart-items");
  elements.cartTotal = document.getElementById("cart-total");
  elements.guestForm = document.getElementById("guest-form");
  elements.billingSection = document.getElementById("billing-section");
  elements.depositRadios = document.querySelectorAll('input[name="payAmount"]');

  // Section B elements (payment)
  elements.sectionB = document.getElementById("section-b");
  elements.paymentContainer = document.getElementById("payment-container");
  elements.cardNumber = document.getElementById("card-number");
  elements.securityCode = document.getElementById("security-code");
  elements.payButton = document.getElementById("pay-button");
  elements.backToBookingBtn = document.getElementById("back-to-booking");

  // Common elements
  elements.continueButton = document.getElementById("continue-to-payment");
  elements.removeButtons = document.querySelectorAll(".remove-item");
}

function showEmptyCartState() {
  const html = `
    <div class="empty-cart">
      <h2>Your cart is empty</h2>
      <p>Please select some packages and activities to continue.</p>
      <a href="/landing" class="primary-btn">Browse Packages</a>
    </div>
  `;
  document.body.innerHTML = html;
}

function showErrorState(message) {
  const html = `
    <div class="error-state">
      <h2>Error</h2>
      <p>${message}</p>
      <a href="/checkout?items=${encodeURIComponent(cart.getCart().join(","))}" class="primary-btn">Retry</a>
    </div>
  `;
  document.body.innerHTML = html;
}

function renderPageContent(skus, quote) {
  document.body.innerHTML = `
    <div class="checkout-container">
      <!-- Section A: Cart review + Guest details -->
      <div id="section-a">
        <h2>Booking Details</h2>

        <div class="cart-review">
          <h3>Your Selection</h3>
          <div id="cart-items">
            <!-- Cart items will be rendered here -->
          </div>
          <div class="cart-total">
            <span>Total:</span>
            <span id="cart-total">$${quote.total.toFixed(2)}</span>
          </div>
        </div>

        <div class="guest-info-section">
          <h3>Guest Information</h3>
          <form id="guest-form">
            <div class="form-row">
              <div class="form-group">
                <label for="firstName">First Name *</label>
                <input type="text" id="firstName" name="firstName" required>
              </div>
              <div class="form-group">
                <label for="lastName">Last Name *</label>
                <input type="text" id="lastName" name="lastName" required>
              </div>
            </div>

            <div class="form-group">
              <label for="email">Email Address *</label>
              <input type="email" id="email" name="email" required>
            </div>

            <div class="form-group">
              <label for="phone">Phone Number *</label>
              <input type="tel" id="phone" name="phone" required>
            </div>

            <div class="form-group">
              <label for="remarks">Remarks (optional)</label>
              <textarea id="remarks" name="remarks" rows="3"></textarea>
            </div>
          </form>
        </div>

        <div class="billing-section" id="billing-section">
          <h3>Billing Address</h3>
          <form id="billing-form">
            <div class="form-group">
              <label for="address1">Address Line 1 *</label>
              <input type="text" id="address1" name="address1" required>
            </div>

            <div class="form-group">
              <label for="locality">City *</label>
              <input type="text" id="locality" name="locality" required>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="administrativeArea">State/Province *</label>
                <input type="text" id="administrativeArea" name="administrativeArea" required>
              </div>
              <div class="form-group">
                <label for="postalCode">Postal Code *</label>
                <input type="text" id="postalCode" name="postalCode" required>
              </div>
            </div>

            <div class="form-group">
              <label for="country">Country *</label>
              <input type="text" id="country" name="country" required placeholder="e.g., US, NP">
            </div>
          </form>
        </div>

        <div class="payment-selection">
          <h3>Payment Method</h3>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="payAmount" value="deposit" checked>
              <span>Pay Deposit (now)</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="payAmount" value="full">
              <span>Pay Full Amount (now)</span>
            </label>
          </div>
        </div>

        <div class="cart-actions">
          <button type="button" id="continue-to-payment" class="primary-btn">
            Continue to Payment
          </button>
        </div>
      </div>

      <!-- Section B: Payment (microform/unified only) -->
      <div id="section-b" class="hidden">
        <h2>Payment Details</h2>

        <div class="payment-summary">
          <div class="info-row">
            <span>You're about to enter payment details</span>
          </div>
          <div class="info-row">
            <strong>Total to pay: $${quote.total.toFixed(2)}</strong>
          </div>
          <div class="security-badges">
            <div class="badge">🔒 Secure Payment</div>
            <div class="badge">🛡️ PCI Compliant</div>
          </div>
        </div>

        <div class="card-fields">
          <div class="form-group">
            <label for="card-number">Card Number *</label>
            <div id="card-number" class="card-input"></div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="exp-month">Expiry Month *</label>
              <select id="exp-month">
                <option value="01">01</option>
                <option value="02">02</option>
                <option value="03">03</option>
                <option value="04">04</option>
                <option value="05">05</option>
                <option value="06">06</option>
                <option value="07">07</option>
                <option value="08">08</option>
                <option value="09">09</option>
                <option value="10">10</option>
                <option value="11">11</option>
                <option value="12">12</option>
              </select>
            </div>

            <div class="form-group">
              <label for="exp-year">Expiry Year *</label>
              <select id="exp-year">
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
                <option value="2029">2029</option>
                <option value="2030">2030</option>
              </select>
            </div>

            <div class="form-group">
              <label for="security-code">CVV *</label>
              <div id="security-code" class="card-input"></div>
            </div>
          </div>
        </div>

        <div class="payment-actions">
          <button type="button" id="pay-button" class="primary-btn">
            Pay Now
          </button>
          <button type="button" id="back-to-booking" class="secondary-btn">
            Back to Booking Details
          </button>
        </div>
      </div>

      <div id="payment-container">
        <!-- Payment progress -->
        <div id="payment-progress" class="progress-bar processing" style="display:none; padding:16px; text-align:center; font-weight:600; color:var(--text-primary); background:var(--cream); border-radius:var(--radius-md); margin-top:20px;">
          Processing...
        </div>
        <!-- Step-up challenge -->
        <div id="payment-stepup" style="display:none; margin-top:20px; padding:20px; background:var(--warning-bg); border-radius:var(--radius-md); border-left:4px solid var(--warning);">
          <p style="margin:0 0 12px; font-weight:600;">Your bank needs to verify this payment — this may take a moment.</p>
          <iframe id="stepup-iframe" name="stepup-iframe" width="420" height="420" style="border:1px solid var(--warm-gray); border-radius:var(--radius-sm); display:block; margin:0 auto;"></iframe>
          <form id="stepup-form" target="stepup-iframe" method="POST" style="display:none;">
            <input type="hidden" name="JWT" id="stepup-jwt" value="">
          </form>
        </div>
        <!-- Failed state -->
        <div id="payment-failed" style="display:none; margin-top:20px; padding:24px; background:var(--error-bg); border-radius:var(--radius-md); border-left:4px solid var(--error);">
          <h3 style="margin-top:0; color:var(--error);">Payment Not Completed</h3>
          <p class="error-text" style="margin:8px 0; color:var(--text-primary);">Something went wrong with your payment.</p>
          <p class="error-details" style="font-size:0.85rem; color:var(--text-muted); display:none;"></p>
          <div style="margin-top:16px; display:flex; gap:12px;">
            <button type="button" class="retry-btn primary-btn" onclick="this.closest('#payment-failed').style.display='none'; document.getElementById('section-b')?.classList.remove('hidden');">Retry Payment</button>
            <button type="button" class="edit-btn secondary-btn" onclick="this.closest('#payment-failed').style.display='none'; document.getElementById('section-b')?.classList.remove('hidden');">Edit Card</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Set up validation for form fields
  setupValidation();
}

function renderCartItems(items) {
  if (!items || !items.length) {
    elements.cartItems.innerHTML = `<p>No items in cart</p>`;
    return;
  }

  const html = items.map(item => `
    <div class="cart-item">
      <div class="item-info">
        <h4>${item.name}</h4>
        <p class="item-price">$${item.price.toFixed(2)}</p>
      </div>
      <button type="button" class="remove-item" data-sku="${item.sku}">Remove</button>
    </div>
  `).join('');

  elements.cartItems.innerHTML = html;
}

function setupEventListeners() {
  // Continue to payment button
  elements.continueButton.addEventListener("click", handleContinueToPayment);

  // Back to booking button
  elements.backToBookingBtn.addEventListener("click", handleBackToBooking);

  // Pay button
  elements.payButton.addEventListener("click", handlePayClick);

  // Remove item buttons
  elements.removeButtons.forEach(btn => {
    btn.addEventListener("click", handleRemoveItem);
  });

  // Form validation on blur
  const formInputs = elements.guestForm.querySelectorAll("input, textarea");
  formInputs.forEach(input => {
    input.addEventListener("blur", () => validateField(input.name, input.value));
  });

  const billingInputs = elements.billingSection.querySelectorAll("input");
  billingInputs.forEach(input => {
    input.addEventListener("blur", () => validateField(input.name, input.value));
  });

  // Currency code example hint
  const countryInput = document.getElementById("country");
  countryInput.addEventListener("input", () => {
    if (countryInput.value && !/^[A-Z]{2}$/.test(countryInput.value.toUpperCase())) {
      countryInput.title = "Use 2-letter country code (e.g., US, NP)";
    } else {
      countryInput.title = "";
    }
  });
}

async function handleContinueToPayment() {
  // Validate all fields
  const formData = collectGuestData();
  const validationResults = validateAllFields(formData);

  if (!validationResults.isValid) {
    showValidationErrors(validationResults.errors);
    return;
  }

  // Show loading state
  setLoadingState(true);

  try {
    // Build guest and billTo objects
    const guest = buildGuestObject(formData);
    const billTo = buildBillTo(formData);
    const payAmount = getSelectedPayAmount();

    // Create session
    const sessionData = await createSession(currentSkus, payAmount, guest);

    // Mount card fields
    await mountCardFields(sessionData.captureContext);

    // Show Section B, hide Section A
    elements.sectionA.classList.add("hidden");
    elements.sectionB.classList.remove("hidden");
    elements.paymentContainer.classList.remove("hidden");

    // Disable Section A controls once Section B is active (per plan)
    elements.removeButtons.forEach(btn => btn.disabled = true);
    elements.depositRadios.forEach(r => r.disabled = true);

    // Store booking ID for payment flow
    currentBookingId = sessionData.bookingId;

    // Initialize payment flow
    initPaymentFlow(sessionData.captureContext, sessionData.bookingId, currentQuote ? currentQuote.total : 0);

  } catch (error) {
    console.error("Error advancing to payment:", error);
    showError("Failed to prepare payment. Please try again.");
  } finally {
    setLoadingState(false);
  }
}

function collectGuestData() {
  const form = elements.guestForm;
  const billingForm = elements.billingSection.querySelector("form");

  return {
    firstName: form.querySelector("#firstName").value,
    lastName: form.querySelector("#lastName").value,
    email: form.querySelector("#email").value,
    phone: form.querySelector("#phone").value,
    remarks: form.querySelector("#remarks").value,
    address1: billingForm.querySelector("#address1").value,
    locality: billingForm.querySelector("#locality").value,
    administrativeArea: billingForm.querySelector("#administrativeArea").value,
    postalCode: billingForm.querySelector("#postalCode").value,
    country: billingForm.querySelector("#country").value,
    payAmount: getSelectedPayAmount()
  };
}

function buildGuestObject(data) {
  return {
    name: `${data.firstName} ${data.lastName}`,
    email: data.email,
    phone: data.phone,
    remarks: data.remarks || ""
  };
}

function buildBillTo(data) {
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    address1: data.address1,
    locality: data.locality,
    administrativeArea: data.administrativeArea,
    postalCode: data.postalCode,
    country: data.country
  };
}

function getSelectedPayAmount() {
  const checked = document.querySelector('input[name="payAmount"]:checked');
  return checked ? checked.value : "deposit";
}

function setupValidation() {
  // Inline validation functions
  window.validateField = function(name, value) {
    const validation = validateFieldValue(name, value);
    const input = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`);

    if (!validation.valid) {
      input.classList.add("invalid");
      showFieldError(input, validation.message);
    } else {
      input.classList.remove("invalid");
      hideFieldError(input);
    }

    return validation;
  };

  window.validateFieldValue = function(name, value) {
    switch (name) {
      case "firstName":
      case "lastName":
        return utils.validateRequired(value) ? { valid: true } : { valid: false, message: "This field is required" };
      case "email":
        return utils.validateEmail(value) ? { valid: true } : { valid: false, message: "Please enter a valid email address" };
      case "phone":
        return utils.validateRequired(value) && /^\+?\d{10,}$/.test(value) ? { valid: true } : { valid: false, message: "Please enter a valid phone number" };
      case "address1":
      case "locality":
      case "administrativeArea":
      case "postalCode":
      case "country":
        return utils.validateRequired(value) ? { valid: true } : { valid: false, message: "This field is required" };
      case "remarks":
        return { valid: true }; // Optional field
      default:
        return { valid: true };
    }
  };

  window.showFieldError = function(input, message) {
    // Remove existing error message
    const existingError = input.parentElement.querySelector(".error-message");
    if (existingError) existingError.remove();

    // Add error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.textContent = message;
    input.parentElement.appendChild(errorDiv);
  };

  window.hideFieldError = function(input) {
    const errorDiv = input.parentElement.querySelector(".error-message");
    if (errorDiv) errorDiv.remove();
  };
}

function validateAllFields(data) {
  const errors = {};
  let isValid = true;

  // Validate guest fields
  const guestValidations = [
    { field: "firstName", validation: utils.validateRequired(data.firstName) },
    { field: "lastName", validation: utils.validateRequired(data.lastName) },
    { field: "email", validation: utils.validateEmail(data.email) },
    { field: "phone", validation: utils.validateRequired(data.phone) && /^\+?\d{10,}$/.test(data.phone) }
  ];

  guestValidations.forEach(({ field, validation }) => {
    if (!validation) {
      errors[field] = getFieldErrorMessage(field);
      isValid = false;
    }
  });

  // Validate billing fields
  const billingFields = ["address1", "locality", "administrativeArea", "postalCode", "country"];
  billingFields.forEach(field => {
    if (!utils.validateRequired(data[field])) {
      errors[field] = `${getFieldLabel(field)} is required`;
      isValid = false;
    }
  });

  return { isValid, errors };
}

function getFieldErrorMessage(field) {
  const messages = {
    firstName: "First name is required",
    lastName: "Last name is required",
    email: "Please enter a valid email address",
    phone: "Please enter a valid phone number"
  };
  return messages[field] || "This field is required";
}

function getFieldLabel(field) {
  const labels = {
    address1: "Address",
    locality: "City",
    administrativeArea: "State/Province",
    postalCode: "Postal Code",
    country: "Country"
  };
  return labels[field] || field;
}

function showValidationErrors(errors) {
  // Scroll to first error
  const firstErrorField = Object.keys(errors)[0];
  if (firstErrorField) {
    const element = document.querySelector(`input[name="${firstErrorField}"], textarea[name="${firstErrorField}"]`);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Display summary of errors
  const errorSummary = Object.values(errors).join(", ");
  showError(`Please fix the following: ${errorSummary}`);
}

async function createSession(skus, payAmount, guest) {
  const response = await fetch("/api/microform/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skus,
      payAmount,
      guest
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create session");
  }

  return response.json();
}

async function mountCardFields(captureContext) {
  try {
    // Load Microform script (same as in worker.js test)
    const { ctx } = decodeJwt(captureContext);
    const { clientLibrary, clientLibraryIntegrity } = ctx[0].data;

    await loadScript(clientLibrary, clientLibraryIntegrity);

    // Note: In production, the library would be loaded once and reused
    const flex = new Flex(captureContext);
    microformInstance = flex.microform('card');

    // Create card fields
    microformInstance.createField('number', {
      placeholder: 'Card number',
      mask: '#### #### #### ####'
    }).load('#card-number');

    microformInstance.createField('securityCode', {
      placeholder: 'CVV',
      mask: '###'
    }).load('#security-code');

  } catch (error) {
    console.error("Failed to mount card fields:", error);
    throw error;
  }
}

function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    if (window.Flex) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.integrity = integrity || "";
    script.crossOrigin = "anonymous";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load the payment field library"));
    document.head.appendChild(script);
  });
}

function initPaymentFlow(captureContext, bookingId, amount) {
  // Import payment-states module dynamically and instantiate PaymentFlow
  import('../client/payment-states.js').then(module => {
    const PaymentFlowClass = module.default || module;
    const flowInstance = new PaymentFlowClass();
    window.paymentFlow = flowInstance;
    flowInstance.start({
      bookingId,
      microformInstance,
      amount,
      currency: "USD",
      billTo: buildBillTo(collectGuestData()),
      checkin: cart.getDates().checkin,
      checkout: cart.getDates().checkout
    });
  }).catch(error => {
    console.error("Failed to initialize payment flow:", error);
    showError("Payment initialization failed");
  });
}

function handleBackToBooking() {
  // Show Section A, hide Section B and payment container
  elements.sectionA.classList.remove("hidden");
  elements.sectionB.classList.add("hidden");
  elements.paymentContainer.classList.add("hidden");

  // Re-enable Section A controls when returning from Section B
  elements.removeButtons.forEach(btn => btn.disabled = false);
  elements.depositRadios.forEach(r => r.disabled = false);

  // Cancel any ongoing payment flow and reset session state
  if (window.paymentFlow) {
    window.paymentFlow.cancel();
  }
  currentBookingId = null;
  microformInstance = null;
}

async function handlePayClick() {
  if (!microformInstance) {
    showError("Payment fields not properly initialized");
    return;
  }

  setLoadingState(true);

  try {
    // Create token
    const token = await createCardToken();

    // Proceed with payment flow (handled by payment-flow module)
    if (window.paymentFlow) {
      window.paymentFlow.start({
        bookingId: currentBookingId,
        microformInstance,
        amount: currentQuote ? currentQuote.total : 0,
        currency: "USD",
        billTo: buildBillTo(collectGuestData()),
        checkin: cart.getDates().checkin,
        checkout: cart.getDates().checkout
      });
    }

  } catch (error) {
    console.error("Payment failed:", error);
    showError("Payment failed. Please check your card details and try again.");
  } finally {
    setLoadingState(false);
  }
}

async function createCardToken() {
  return new Promise((resolve, reject) => {
    microformInstance.createToken({
      expirationMonth: document.getElementById("exp-month").value,
      expirationYear: document.getElementById("exp-year").value
    }, (err, token) => {
      if (err) reject(err);
      else resolve(token);
    });
  });
}

async function handleRemoveItem(event) {
  const sku = event.target.dataset.sku;

  try {
    await cart.removeFromCart(sku);

    // Re-fetch quote for updated total
    const skus = cart.getCart();
    const quote = await cart.fetchQuote(skus);

    // Update UI
    elements.cartTotal.textContent = `$${quote.total.toFixed(2)}`;
    renderCartItems(quote.items);

    // Update stored quote
    window.quote = quote;

  } catch (error) {
    console.error("Failed to remove item:", error);
    showError("Failed to update cart. Please try again.");
  }
}

function setLoadingState(isLoading) {
  elements.continueButton.disabled = isLoading;
  elements.payButton.disabled = isLoading;

  if (isLoading) {
    elements.continueButton.textContent = "Processing...";
    elements.payButton.textContent = "Processing...";
  } else {
    elements.continueButton.textContent = "Continue to Payment";
    elements.payButton.textContent = "Pay Now";
  }
}

function showError(message) {
  // Create and show error notification
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-notification";
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);

  setTimeout(() => {
    if (errorDiv.parentElement) {
      errorDiv.parentElement.removeChild(errorDiv);
    }
  }, 5000);
}

function applyDesignTokens() {
  if (document.head.querySelector('style[data-checkout-design-tokens="true"]')) return;

  const style = document.createElement("style");
  style.setAttribute("data-checkout-design-tokens", "true");
  style.textContent = `
    ${injectThemeCSS()}
    .checkout-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: var(--glass-white);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--glass-shadow);
      font-family: 'DM Sans', sans-serif;
    }

    .hidden {
      display: none !important;
    }

    h1, h2, h3 {
      font-family: 'DM Sans', sans-serif;
      color: var(--text-primary);
    }

    .primary-btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: var(--radius-md);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .primary-btn:hover:not(:disabled) {
      background: var(--accent-hover);
      transform: translateY(-1px);
      box-shadow: var(--shadow-card);
    }

    .primary-btn:disabled {
      background: var(--warm-gray);
      cursor: not-allowed;
      transform: none;
    }

    .secondary-btn {
      background: transparent;
      color: var(--accent);
      border: 2px solid var(--accent);
      padding: 10px 22px;
      border-radius: var(--radius-md);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .secondary-btn:hover {
      background: var(--accent-light);
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--warm-gray);
      border-radius: var(--radius-sm);
      font-size: 14px;
      transition: border-color 0.2s ease;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(184, 92, 56, 0.1);
    }

    .form-group input.invalid {
      border-color: var(--error);
      background-color: var(--error-bg);
    }

    .error-message {
      color: var(--error);
      font-size: 12px;
      margin-top: 4px;
    }

    .card-input {
      min-height: 44px;
      border: 1px solid var(--warm-gray);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-size: 14px;
      background: white;
      display: flex;
      align-items: center;
    }

    .card-input:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(184, 92, 56, 0.1);
    }

    .cart-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: white;
      border-radius: var(--radius-sm);
      margin-bottom: 8px;
      box-shadow: var(--shadow-card);
    }

    .item-info h4 {
      margin: 0 0 4px 0;
      font-size: 16px;
    }

    .item-price {
      color: var(--text-secondary);
      font-size: 14px;
    }

    .remove-item {
      background: var(--error-bg);
      color: var(--error);
      border: none;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }

    .remove-item:hover {
      background: #fadadd;
    }

    .radio-group {
      display: flex;
      gap: 20px;
      margin: 16px 0;
    }

    .radio-label {
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .radio-label input {
      margin-right: 8px;
    }

    .error-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--error);
      color: white;
      padding: 12px 20px;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-elevated);
      z-index: 1000;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .empty-cart {
      text-align: center;
      padding: 60px 20px;
      background: white;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-card);
    }

    .empty-cart h2 {
      margin-bottom: 16px;
    }

    .empty-cart .primary-btn {
      display: inline-block;
      margin-top: 20px;
    }

    .security-badges {
      display: flex;
      gap: 12px;
      margin: 16px 0;
    }

    .badge {
      background: var(--success-bg);
      color: var(--success);
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
}

function decodeJwt(jwt) {
  const p = jwt.split('.')[1];
  return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
}

// Export for module usage
export {
  createSession,
  mountCardFields,
  initPaymentFlow,
  showError,
  setLoadingState
};
