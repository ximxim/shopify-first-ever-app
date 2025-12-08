import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */

export function cartLinesDiscountsGenerateRun(input) {
  // Check if we have the ORDER discount class
  const hasOrderDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Order,
  );

  if (!hasOrderDiscountClass) {
    return { operations: [] };
  }

  // Get the raffle_discount_amount from cart attributes
  const raffleDiscountAttribute = input.cart.attribute;

  // If no attribute or no value, return no discount
  if (!raffleDiscountAttribute || !raffleDiscountAttribute.value) {
    return { operations: [] };
  }

  // Parse the discount percentage value
  const discountPercentage = parseFloat(raffleDiscountAttribute.value);

  // Validate the discount is between 5 and 10
  if (
    isNaN(discountPercentage) ||
    discountPercentage < 5 ||
    discountPercentage > 10
  ) {
    return { operations: [] };
  }

  // Apply the discount as an order discount
  return {
    operations: [
      {
        orderDiscountsAdd: {
          candidates: [
            {
              message: `${discountPercentage}% RAFFLE DISCOUNT`,
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: [],
                  },
                },
              ],
              value: {
                percentage: {
                  value: discountPercentage,
                },
              },
            },
          ],
          selectionStrategy: OrderDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
