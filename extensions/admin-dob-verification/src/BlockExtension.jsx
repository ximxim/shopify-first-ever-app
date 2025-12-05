import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Fetches the date_of_birth metafield for an order
 * Uses "$app" namespace for app-owned metafields defined in shopify.app.toml
 */
async function fetchOrderMetafield(orderId) {
  const query = `
    query GetOrderMetafield($id: ID!) {
      order(id: $id) {
        metafield(namespace: "$app", key: "date_of_birth") {
          value
        }
      }
    }
  `;

  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    body: JSON.stringify({
      query,
      variables: { id: orderId },
    }),
  });

  if (!res.ok) {
    throw new Error('Network error');
  }

  return res.json();
}

/**
 * Sets the date_of_birth and verified_at metafields for an order
 * Uses "$app" namespace for app-owned metafields defined in shopify.app.toml
 */
async function setOrderMetafields(orderId, dateOfBirth) {
  const mutation = `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const today = new Date().toISOString().split('T')[0];

  const res = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    body: JSON.stringify({
      query: mutation,
      variables: {
        metafields: [
          {
            ownerId: orderId,
            namespace: '$app',
            key: 'date_of_birth',
            type: 'date',
            value: dateOfBirth,
          },
          {
            ownerId: orderId,
            namespace: '$app',
            key: 'verified_at',
            type: 'date',
            value: today,
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    throw new Error('Network error');
  }

  return res.json();
}

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { i18n, data } = shopify;
  const orderId = data.selected[0]?.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState(null);

  // Fetch existing metafield on mount
  useEffect(() => {
    if (!orderId) return;

    (async () => {
      try {
        const result = await fetchOrderMetafield(orderId);
        const existingDob = result?.data?.order?.metafield?.value;

        if (existingDob) {
          setIsVerified(true);
          setDateOfBirth(existingDob);
        }
      } catch (err) {
        // Silently handle fetch errors - form will show for new entries
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  // Handle submission via button click
  const handleSubmit = useCallback(async () => {
    if (!dateOfBirth || !orderId) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await setOrderMetafields(orderId, dateOfBirth);

      if (result?.data?.metafieldsSet?.userErrors?.length > 0) {
        setError(i18n.translate('errorMessage'));
        return;
      }

      setIsVerified(true);
    } catch (err) {
      setError(i18n.translate('errorMessage'));
    } finally {
      setSubmitting(false);
    }
  }, [dateOfBirth, orderId, i18n]);

  // Loading state
  if (loading) {
    return (
      <s-admin-block heading={i18n.translate('heading')}>
        <s-stack direction="block" gap="base">
          <s-spinner size="base" />
          <s-text>{i18n.translate('loadingMessage')}</s-text>
        </s-stack>
      </s-admin-block>
    );
  }

  // Already verified state
  if (isVerified) {
    return (
      <s-admin-block heading={i18n.translate('heading')}>
        <s-banner tone="success">
          {i18n.translate('successMessage')}
        </s-banner>
      </s-admin-block>
    );
  }

  // Form state
  return (
    <s-admin-block heading={i18n.translate('heading')}>
      <s-stack direction="block" gap="base">
        {error && (
          <s-banner tone="critical" dismissible onDismiss={() => setError(null)}>
            {error}
          </s-banner>
        )}

        <s-date-field
          label={i18n.translate('dateOfBirthLabel')}
          placeholder={i18n.translate('dateOfBirthPlaceholder')}
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.currentTarget.value)}
          required
        />

        <s-button
          variant="primary"
          loading={submitting}
          disabled={!dateOfBirth || submitting}
          onClick={handleSubmit}
        >
          {i18n.translate('submitButton')}
        </s-button>
      </s-stack>
    </s-admin-block>
  );
}
