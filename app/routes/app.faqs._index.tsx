import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

interface FAQ {
  id: string;
  handle: string;
  displayName: string;
  question: string | null;
  answer: string | null;
  updatedAt: string;
}

interface LoaderData {
  faqs: FAQ[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor: string | null;
  startCursor: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const direction = url.searchParams.get("direction") || "forward";

  const paginationArgs =
    direction === "backward"
      ? `last: 10, before: ${cursor ? `"${cursor}"` : null}`
      : `first: 10, after: ${cursor ? `"${cursor}"` : null}`;

  const response = await admin.graphql(
    `#graphql
    query GetFAQs {
      metaobjects(type: "shopify--qa-pair", ${paginationArgs}) {
        nodes {
          id
          handle
          displayName
          updatedAt
          question: field(key: "question") {
            value
          }
          answer: field(key: "answer") {
            value
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }`,
  );

  const responseJson = await response.json();
  const metaobjects = responseJson.data?.metaobjects;

  const faqs: FAQ[] =
    metaobjects?.nodes?.map((node: any) => ({
      id: node.id,
      handle: node.handle,
      displayName: node.displayName,
      question: node.question?.value || null,
      answer: node.answer?.value || null,
      updatedAt: node.updatedAt,
    })) || [];

  return {
    faqs,
    hasNextPage: metaobjects?.pageInfo?.hasNextPage || false,
    hasPreviousPage: metaobjects?.pageInfo?.hasPreviousPage || false,
    endCursor: metaobjects?.pageInfo?.endCursor || null,
    startCursor: metaobjects?.pageInfo?.startCursor || null,
  } satisfies LoaderData;
};

export default function FAQsIndex() {
  const { faqs, hasNextPage, hasPreviousPage, endCursor, startCursor } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleNextPage = () => {
    if (endCursor) {
      navigate(`/app/faqs?cursor=${endCursor}&direction=forward`);
    }
  };

  const handlePreviousPage = () => {
    if (startCursor) {
      navigate(`/app/faqs?cursor=${startCursor}&direction=backward`);
    }
  };

  const truncateText = (text: string | null, maxLength: number = 80) => {
    if (!text) return "—";
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  };

  return (
    <s-page heading="FAQs">
      <s-button slot="primary-action" href="/app/faqs/new">
        Add FAQ
      </s-button>

      {faqs.length === 0 ? (
        <s-section>
          <s-stack direction="block" gap="large" alignItems="center">
            <s-icon type="question-circle" size="base" />
            <s-heading>No FAQs yet</s-heading>
            <s-paragraph>
              Create your first FAQ to help customers find answers quickly.
            </s-paragraph>
            <s-button href="/app/faqs/new" variant="primary">
              Create FAQ
            </s-button>
          </s-stack>
        </s-section>
      ) : (
        <s-section>
          <s-table>
            <s-table-header>
              <s-table-row>
                <s-table-cell>Question</s-table-cell>
                <s-table-cell>Answer</s-table-cell>
                <s-table-cell>Last Updated</s-table-cell>
                <s-table-cell>Actions</s-table-cell>
              </s-table-row>
            </s-table-header>
            <s-table-body>
              {faqs.map((faq) => (
                <s-table-row key={faq.id}>
                  <s-table-cell>
                    <s-text type="strong">
                      {truncateText(faq.question, 50)}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">
                      {truncateText(faq.answer, 60)}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">
                      {new Date(faq.updatedAt).toLocaleDateString()}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small">
                      <s-button
                        variant="tertiary"
                        href={`/app/faqs/${encodeURIComponent(faq.id)}`}
                      >
                        Edit
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>

          {(hasPreviousPage || hasNextPage) && (
            <s-stack direction="inline" gap="base" justifyContent="center">
              <s-button
                variant="secondary"
                disabled={!hasPreviousPage}
                onClick={handlePreviousPage}
              >
                Previous
              </s-button>
              <s-button
                variant="secondary"
                disabled={!hasNextPage}
                onClick={handleNextPage}
              >
                Next
              </s-button>
            </s-stack>
          )}
        </s-section>
      )}

      <s-section slot="aside" heading="About FAQs">
        <s-paragraph>
          Create FAQ entries and assign them to products. Customers can view
          these FAQs on product pages to get quick answers to common questions.
        </s-paragraph>
        <s-paragraph>
          <s-link href="/app/faqs/assign">Assign FAQs to products →</s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
