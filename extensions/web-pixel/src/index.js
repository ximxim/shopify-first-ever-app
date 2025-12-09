import { register } from "@shopify/web-pixels-extension";

register(({ analytics, browser, init, settings }) => {
  console.log("Web Pixel initialized with settings:", settings);

  // Subscribe to all events emitted by Shopify
  analytics.subscribe("all_events", (event) => {
    console.log("Event Name:", event.name);
    console.log("Event Payload:", event);
    console.log("Settings:", settings);
  });
});
