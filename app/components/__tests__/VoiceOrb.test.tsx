import { render } from "@testing-library/react";
import VoiceOrb from "../VoiceOrb";

describe("VoiceOrb Component", () => {
  const defaultProps = {
    isAuthenticated: true,
    isLoading: false,
    isErrored: false,
    isUserSpeaking: false,
    hasMessage: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render the orb element", () => {
      const { container } = render(<VoiceOrb {...defaultProps} />);

      const orb = container.querySelector("div");
      expect(orb).toBeInTheDocument();
    });

    it("should have correct base classes", () => {
      const { container } = render(<VoiceOrb {...defaultProps} />);

      const orb = container.querySelector("div");
      expect(orb).toHaveClass(
        "absolute",
        "size-48",
        "blur-3xl",
        "rounded-full"
      );
    });
  });

  describe("visibility states", () => {
    it("should be hidden when not authenticated", () => {
      const { container } = render(
        <VoiceOrb {...defaultProps} isAuthenticated={false} />
      );

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("opacity-0");
    });

    it("should be hidden when loading", () => {
      const { container } = render(
        <VoiceOrb {...defaultProps} isLoading={true} />
      );

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("opacity-0");
    });

    it("should be hidden when errored", () => {
      const { container } = render(
        <VoiceOrb {...defaultProps} isErrored={true} />
      );

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("opacity-0");
    });

    it("should show low opacity when authenticated and idle", () => {
      const { container } = render(<VoiceOrb {...defaultProps} />);

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("opacity-30");
    });

    it("should show full opacity when user is speaking", () => {
      const { container } = render(
        <VoiceOrb {...defaultProps} isUserSpeaking={true} />
      );

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("opacity-100", "scale-110");
    });

    it("should show full opacity when there is a message", () => {
      const { container } = render(
        <VoiceOrb {...defaultProps} hasMessage={true} />
      );

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("opacity-100", "scale-110");
    });

    it("should show full opacity when both speaking and has message", () => {
      const { container } = render(
        <VoiceOrb {...defaultProps} isUserSpeaking={true} hasMessage={true} />
      );

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("opacity-100", "scale-110");
    });
  });

  describe("styling", () => {
    it("should have correct background gradient classes", () => {
      const { container } = render(<VoiceOrb {...defaultProps} />);

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("bg-linear-to-b", "from-cyan-200", "to-cyan-400");
    });

    it("should have dark mode gradient classes", () => {
      const { container } = render(<VoiceOrb {...defaultProps} />);

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("dark:from-cyan-600", "dark:to-cyan-800");
    });

    it("should have correct positioning and z-index", () => {
      const { container } = render(<VoiceOrb {...defaultProps} />);

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("absolute", "-z-50");
    });

    it("should have transition classes", () => {
      const { container } = render(<VoiceOrb {...defaultProps} />);

      const orb = container.querySelector("div");
      expect(orb).toHaveClass("transition", "ease-in-out");
    });
  });
});
