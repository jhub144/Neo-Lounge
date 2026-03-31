export function calculatePrice(minutes: number, rate: number): number {
  return Math.round((rate / 60) * minutes);
}

export function calculateUntilClosing(now: Date, closingTime: string): number {
  const [closingHour, closingMinute] = closingTime.split(':').map(Number);
  const closing = new Date(now);
  closing.setHours(closingHour, closingMinute, 0, 0);
  const minutes = Math.floor((closing.getTime() - now.getTime()) / 60000);
  return Math.max(0, minutes);
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateAuthCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

const DURATION_OPTIONS = [5, 10, 20, 30, 40, 60];

export function getDurationOptions(rate: number): { minutes: number; price: number }[] {
  return DURATION_OPTIONS.map((minutes) => ({
    minutes,
    price: calculatePrice(minutes, rate),
  }));
}
