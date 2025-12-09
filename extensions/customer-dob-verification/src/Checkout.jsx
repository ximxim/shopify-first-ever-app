import '@shopify/ui-extensions/preact';
import { render } from "preact";
import { useState } from "preact/hooks";
import { useBuyerJourneyIntercept } from "@shopify/ui-extensions/checkout/preact";

// Export the extension
export default async () => {
  render(<Extension />, document.body);
};

/**
 * Calculate age from a date of birth string (YYYY-MM-DD format)
 */
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  const today = new Date();
  const birthDate = new Date(dateOfBirth);

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  // Adjust age if birthday hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

function Extension() {
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [validationError, setValidationError] = useState("");

  // Check instructions for feature availability
  if (!shopify.instructions.value.attributes.canUpdateAttributes) {
    // For checkouts such as draft order invoices, cart attributes may not be allowed
    return (
      <s-banner heading="Age Verification" tone="warning">
        <s-text>Age verification is not available for this checkout.</s-text>
      </s-banner>
    );
  }

  // Use the useBuyerJourneyIntercept hook to validate before checkout progression
  // This hook automatically re-evaluates when dateOfBirth changes
  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    // Check if we can block progress (merchant must enable block_progress capability)
    if (!canBlockProgress) {
      return { behavior: "allow" };
    }

    // Validate: Date of birth is required
    if (!dateOfBirth) {
      return {
        behavior: "block",
        reason: "Date of birth is required",
        errors: [
          {
            message: "Please enter your date of birth to continue.",
          },
        ],
      };
    }

    // Validate: Buyer must be 18 or older
    const age = calculateAge(dateOfBirth);
    if (age !== null && age < 18) {
      return {
        behavior: "block",
        reason: "Age restriction",
        errors: [
          {
            message: "You must be 18 years or older to complete this purchase.",
          },
        ],
      };
    }

    // All validations passed
    return { behavior: "allow" };
  });

  // Handle date field change - fires when user finishes editing (blur or Enter)
  async function handleDateChange(event) {
    const newDate = event.currentTarget.value;
    setDateOfBirth(newDate);

    // Clear any previous validation error
    setValidationError("");

    // Update cart attribute
    if (newDate) {
      const result = await shopify.applyAttributeChange({
        key: "date_of_birth",
        type: "updateAttribute",
        value: newDate,
      });

      if (result.type === "error") {
        console.error("Failed to update date_of_birth attribute:", result.message);
      }

      // Show inline validation if under 18
      const age = calculateAge(newDate);
      if (age !== null && age < 18) {
        setValidationError("You must be 18 years or older to complete this purchase.");
      }
    } else {
      // Remove attribute if date is cleared
      const result = await shopify.applyAttributeChange({
        key: "date_of_birth",
        type: "removeAttribute",
      });

      if (result.type === "error") {
        console.error("Failed to remove date_of_birth attribute:", result.message);
      }
    }
  }

  // Handle input events - fires on every change while typing
  // Used to clear validation errors immediately as user starts editing
  function handleDateInput() {
    // Clear validation errors when user starts typing
    if (validationError) {
      setValidationError("");
    }
  }

  return (
    <s-section heading="Age Verification">
      <s-stack gap="base">
        <s-date-field
          label="Date of Birth"
          value={dateOfBirth}
          required
          error={validationError}
          onChange={handleDateChange}
          onInput={handleDateInput}
        />
        <s-text type="small">
          You must be 18 years or older to complete this purchase.
        </s-text>
      </s-stack>
    </s-section>
  );
}
