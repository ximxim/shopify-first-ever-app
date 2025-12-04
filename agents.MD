# Agents.MD - AI Agent Guide for Shopify App Development

This document provides comprehensive guidance for AI agents working on this Shopify app project. It outlines the project structure, technologies, conventions, and best practices to ensure effective collaboration.

## Project Overview

This is a Shopify app built using React Router (forked from Remix) that provides an embedded admin interface for merchants. The app demonstrates integration with Shopify's Admin GraphQL API, webhook handling, and session management using Prisma.

**Key Purpose**: Template/starting point for building Shopify apps with React Router, showcasing authentication, data fetching, and UI components.

## Technology Stack

### Core Framework
- **React Router v7**: Multi-strategy router for React, providing server-side rendering and file-based routing
- **React 18**: UI library
- **TypeScript**: Type-safe development

### Shopify Integration
- **@shopify/shopify-app-react-router**: Shopify app integration package for React Router
- **@shopify/app-bridge-react**: App Bridge for embedded app UI
- **Shopify Admin GraphQL API**: For querying and mutating Shopify data
- **Shopify Dev MCP**: Model Context Protocol integration for AI-assisted development

### UI Components
- **Polaris Web Components**: Shopify's design system components (e.g., `<s-page>`, `<s-button>`, `<s-section>`)
- **App Bridge**: For embedded app navigation and UI patterns

### Database & Storage
- **Prisma**: ORM for database management
- **SQLite**: Default database (can be migrated to PostgreSQL, MySQL, etc. for production)
- **@shopify/shopify-app-session-storage-prisma**: Prisma adapter for session storage

### Development Tools
- **Vite**: Build tool and dev server
- **ESLint**: Code linting
- **TypeScript**: Type checking
- **Shopify CLI**: For development, deployment, and extension generation

## Project Structure

```
first-ever-app/
├── app/
│   ├── db.server.ts              # Prisma client instance (server-only)
│   ├── entry.server.tsx          # Server entry point
│   ├── root.tsx                  # Root component
│   ├── routes/                   # File-based routing
│   │   ├── _index/               # Home route (public)
│   │   │   ├── route.tsx         # Route component
│   │   │   └── styles.module.css # Route-specific styles
│   │   ├── app.tsx               # App layout route (authenticated)
│   │   ├── app._index.tsx        # App home page
│   │   ├── app.additional.tsx    # Additional app page
│   │   ├── auth.$.tsx            # Auth catch-all route
│   │   ├── auth.login/           # Login route
│   │   ├── webhooks.app.uninstalled.tsx  # App uninstalled webhook
│   │   └── webhooks.app.scopes_update.tsx # Scopes update webhook
│   ├── routes.ts                 # Route configuration
│   └── shopify.server.ts         # Shopify app configuration (server-only)
├── extensions/                   # Shopify app extensions
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── migrations/              # Database migrations
├── public/                      # Static assets
├── shopify.app.toml             # Shopify app configuration
└── vite.config.ts              # Vite configuration
```

### Key Files Explained

- **`app/shopify.server.ts`**: Configures the Shopify app instance, authentication, session storage, and API version
- **`app/db.server.ts`**: Exports Prisma client instance (server-only module)
- **`app/routes/`**: File-based routing - each file/directory represents a route
- **`shopify.app.toml`**: Defines app metadata, webhooks, scopes, and build configuration
- **`prisma/schema.prisma`**: Database schema definition (currently Session model for auth)

## Shopify MCP Integration

This project is configured with **Shopify Dev MCP** (Model Context Protocol) to enable AI-assisted development. The MCP configuration is defined in `.mcp.json`.

### Available MCP Capabilities

1. **GraphQL Schema Introspection**
   - Use `mcp_shopify-dev-mcp_introspect_graphql_schema` to explore Shopify GraphQL schemas
   - Supports Admin API, Storefront API, Partner API, Customer API, and Functions APIs
   - Helps generate valid GraphQL queries and mutations

2. **Code Validation**
   - **GraphQL Validation**: `mcp_shopify-dev-mcp_validate_graphql_codeblocks` - Validates GraphQL operations against Shopify schemas
   - **Component Validation**: `mcp_shopify-dev-mcp_validate_component_codeblocks` - Validates Polaris components and props
   - **Theme Validation**: `mcp_shopify-dev-mcp_validate_theme` - Validates Liquid theme files

3. **Documentation Search**
   - `mcp_shopify-dev-mcp_search_docs_chunks` - Search Shopify developer documentation
   - `mcp_shopify-dev-mcp_fetch_full_docs` - Retrieve full documentation pages

4. **API Learning**
   - `mcp_shopify-dev-mcp_learn_shopify_api` - Initialize context for specific Shopify APIs
   - Required before using other Shopify MCP tools

### MCP Workflow

1. **Initialize API Context**: Call `learn_shopify_api` with the target API (e.g., "admin", "storefront-graphql")
2. **Save conversationId**: Use the returned conversationId for all subsequent tool calls
3. **Search/Introspect**: Use search or introspection tools to find relevant APIs
4. **Validate Code**: Always validate generated GraphQL or component code before suggesting it

## Code Separation Rules

### ⚠️ CRITICAL: Server and Client Code Separation

**This project enforces strict separation between server and client code following React Router conventions.**

#### Rules

1. **Server Code MUST be in `.server.ts` or `.server.tsx` files**
   - Examples: `route.server.tsx`, `utils.server.ts`, `api.server.ts`
   - Server-only code includes:
     - `loader` functions (data fetching)
     - `action` functions (form submissions, mutations)
     - `headers` functions (response headers)
     - Database access (Prisma queries)
     - API calls to Shopify Admin API
     - Authentication logic
     - Environment variable access
     - File system operations

2. **Client Code MUST be in `.client.ts` or `.client.tsx` files**
   - Examples: `route.client.tsx`, `components.client.tsx`, `utils.client.ts`
   - Client-only code includes:
     - React components (UI)
     - React hooks (`useState`, `useEffect`, etc.)
     - Browser APIs (`window`, `document`, `localStorage`, etc.)
     - Event handlers (`onClick`, `onSubmit`, etc.)
     - Client-side state management
     - Client-side routing logic

3. **Route Files Should NOT Mix Server and Client Code**
   - ❌ **DO NOT** put `loader`, `action`, or `headers` exports in the same file as React components
   - ✅ **DO** create separate files:
     - `app/routes/app._index/route.server.tsx` - Contains `loader`, `action`, `headers`
     - `app/routes/app._index/route.client.tsx` - Contains the React component
   - Route files can re-export client properties if needed: `export { clientAction, clientLoader } from "./route.client"`

4. **File Naming Conventions**
   - Server files: `*.server.ts` or `*.server.tsx`
   - Client files: `*.client.ts` or `*.client.tsx`
   - Directories can also use `.server/` or `.client/` naming

5. **Examples of Proper Separation**

   **Server File** (`app/routes/products/route.server.tsx`):
   ```tsx
   import type { LoaderFunctionArgs } from "react-router";
   import { authenticate } from "../../shopify.server";

   export const loader = async ({ request }: LoaderFunctionArgs) => {
     const { admin } = await authenticate.admin(request);
     const response = await admin.graphql(`#graphql
       query {
         products(first: 10) {
           nodes { id title }
         }
       }
     `);
     return response.json();
   };
   ```

   **Client File** (`app/routes/products/route.client.tsx`):
   ```tsx
   import { useLoaderData } from "react-router";

   export default function Products() {
     const data = useLoaderData<typeof loader>();
     return <div>{/* Render products */}</div>;
   }
   ```

   **Route File** (`app/routes/products/route.tsx`):
   ```tsx
   export { loader } from "./route.server";
   export { default } from "./route.client";
   ```

6. **Why This Matters**
   - Prevents server code from being bundled in client JavaScript
   - Ensures sensitive server logic (DB access, API keys) never reaches the browser
   - Improves bundle size and performance
   - Aligns with React Router's module-level code splitting
   - Makes code organization clearer and more maintainable

## Common Development Tasks

### Adding a New Route

1. Create route file in `app/routes/` directory
2. If route needs server logic, create `route.server.tsx` with `loader`/`action`
3. Create `route.client.tsx` with React component
4. Export from main route file if using separation pattern

### Querying Shopify Data

1. Use `authenticate.admin(request)` in loader/action
2. Use `admin.graphql()` to execute GraphQL queries
3. Validate GraphQL queries using Shopify MCP validation tools
4. Handle errors appropriately

### Adding Webhooks

1. Define webhook subscription in `shopify.app.toml`
2. Create webhook handler route in `app/routes/webhooks.*.tsx`
3. Use `authenticate.webhook(request)` for webhook authentication
4. Process webhook payload and respond appropriately

### Database Operations

1. Use Prisma client from `app/db.server.ts`
2. Define models in `prisma/schema.prisma`
3. Run migrations: `npm run prisma migrate dev`
4. Generate Prisma client: `npm run prisma generate`

## Code Patterns

### Authentication Pattern

```tsx
// In route.server.tsx
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  // Use admin.graphql() for API calls
};
```

### GraphQL Query Pattern

```tsx
const response = await admin.graphql(`#graphql
  query GetProducts {
    products(first: 10) {
      nodes {
        id
        title
      }
    }
  }
`);

const data = await response.json();
```

### Error Handling Pattern

```tsx
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
```

### Webhook Handler Pattern

```tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);
  // Process webhook payload
  return new Response(null, { status: 200 });
};
```

## API Capabilities

### Shopify Admin GraphQL API

- **Version**: October 2025 (as configured in `shopify.server.ts`)
- **Access**: Via `admin.graphql()` after authentication
- **Common Operations**:
  - Products: Create, read, update, delete
  - Orders: Read, update
  - Customers: Read, update
  - Inventory: Manage stock levels
  - Discounts: Create and manage discount codes

### Current App Scopes

- `write_products` (as defined in `shopify.app.toml`)

### Webhooks Configured

- `app/uninstalled` - Handles app uninstallation
- `app/scopes_update` - Handles scope updates

## Development Workflow

### Local Development

1. **Start Dev Server**: `npm run dev` or `shopify app dev`
2. **Access App**: Press `P` in terminal to open app URL
3. **Install App**: Click install on the app page
4. **Make Changes**: Files auto-reload on save

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Database Setup

```bash
npm run setup  # Generates Prisma client and runs migrations
```

### Deployment

```bash
npm run deploy  # Deploys app configuration to Shopify
```

## Best Practices

1. **Always separate server and client code** - Use `.server.tsx` and `.client.tsx` files
2. **Validate GraphQL queries** - Use Shopify MCP validation before suggesting code
3. **Handle errors gracefully** - Use ErrorBoundary components
4. **Type everything** - Use TypeScript types from React Router and Shopify packages
5. **Follow Shopify conventions** - Use Polaris components, App Bridge patterns
6. **Secure sensitive data** - Never expose server code, API keys, or database credentials
7. **Test webhooks locally** - Use Shopify CLI to trigger test webhooks
8. **Use environment variables** - Store secrets in `.env` (not committed)

## Resources

- [React Router Documentation](https://reactrouter.com/)
- [Shopify App Development](https://shopify.dev/docs/apps/getting-started)
- [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- [Shopify Dev MCP](https://shopify.dev/docs/apps/build/devmcp)
- [Prisma Documentation](https://www.prisma.io/docs)

---

**Last Updated**: Based on React Router v7 and Shopify App React Router v1.0.0

