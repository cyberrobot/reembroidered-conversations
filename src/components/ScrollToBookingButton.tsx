"use client";

interface ScrollToBookingButtonProps {
  title?: string;
}

export function ScrollToBookingButton({ title }: ScrollToBookingButtonProps) {
  const handleScrollToBooking = () => {
    const bookingEl = document.getElementById("book-session");
    if (bookingEl) {
      bookingEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <button
      onClick={handleScrollToBooking}
      className="text-xs font-sans font-medium text-[#A35048] hover:text-[#8C4038] underline underline-offset-4 cursor-pointer"
    >
      {title || "Book a session"}
    </button>
  );
}
