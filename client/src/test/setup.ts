import "@testing-library/jest-dom/vitest";

// Provide an in-memory IndexedDB implementation so client-side tests that
// touch the offline cache / mutation queue can run under jsdom (which has no
// native IDB). Tests that mutate IDB state should reset it themselves via
// resetIndexedDb() below.
import "fake-indexeddb/auto";
