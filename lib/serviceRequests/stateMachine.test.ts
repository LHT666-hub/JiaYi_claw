import { describe, expect, it } from "vitest";
import { getAllowedServiceActions, transitionServiceStatus } from "./stateMachine";

describe("service request state machine", () => {
  it("runs the successful booking path", () => {
    let status = transitionServiceStatus("draft", "submit");
    status = transitionServiceStatus(status, "accept");
    status = transitionServiceStatus(status, "check_availability");
    status = transitionServiceStatus(status, "propose_slot");
    status = transitionServiceStatus(status, "confirm_booking");
    expect(status).toBe("booked");
  });

  it("rejects skipping staff confirmation", () => {
    expect(() => transitionServiceStatus("submitted", "confirm_booking")).toThrow(
      "INVALID_SERVICE_TRANSITION",
    );
  });

  it("returns a proposed appointment to availability checking when the resident requests a change", () => {
    expect(transitionServiceStatus("awaiting_user_confirmation", "request_reschedule")).toBe(
      "checking_availability",
    );
  });

  it("makes terminal states immutable", () => {
    expect(getAllowedServiceActions("completed")).toEqual([]);
    expect(getAllowedServiceActions("cancelled")).toEqual([]);
  });

  it("allows staff to enrich a booked request without changing its status", () => {
    expect(transitionServiceStatus("booked", "update_booking")).toBe("booked");
    expect(getAllowedServiceActions("booked")).toContain("update_booking");
  });
});
