import { Suspense } from 'react';
import { BookingConfirmationPage } from '@/components/BookingConfirmationPage';

export default function ConfirmationPage() {
  return (
    <Suspense>
      <BookingConfirmationPage />
    </Suspense>
  );
}
