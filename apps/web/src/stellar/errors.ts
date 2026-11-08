/** Turns SDK / wallet / contract errors into short, jargon-free Spanish messages. */

const CONTRACT_MESSAGES: Record<number, string> = {
  1: 'No encontramos ese pedido protegido.',
  2: 'No encontramos esa parte del pago.',
  3: 'El pedido debe tener al menos un proveedor.',
  4: 'El pedido tiene demasiados proveedores.',
  5: 'Algún monto no es válido.',
  6: 'La fecha límite no es válida.',
  7: 'El precio del adelanto no es válido.',
  8: 'El pedido no está en el estado correcto para esta acción.',
  9: 'Esta parte ya fue pagada.',
  10: 'Esta entrega ya estaba marcada.',
  11: 'No hay un adelanto ofrecido para esta parte.',
  12: 'No puedes comprar tu propio adelanto.',
  13: 'Pasó el plazo del pedido.',
  14: 'Todavía no venció el plazo del pedido.',
  15: 'El monto es demasiado grande.',
};

export function parseContractErrorCode(text: string): number | null {
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(text);
  return match ? Number(match[1]) : null;
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return '';
}

export class FriendlyError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FriendlyError';
  }
}

export function friendlyError(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  const text = messageOf(error);
  if (/declin|reject|denied|cancel/i.test(text)) return 'Cancelaste la operación en tu billetera.';
  if (/insufficient|not sufficient|underfunded/i.test(text)) return 'No tienes saldo suficiente para esta operación.';
  const code = parseContractErrorCode(text);
  if (code !== null && CONTRACT_MESSAGES[code]) return CONTRACT_MESSAGES[code];
  if (/failed to fetch|networkerror|network request/i.test(text)) return 'No hay conexión con la red. Revisa tu internet e inténtalo de nuevo.';
  if (/account not found|op_no_destination|not exist/i.test(text)) return 'Tu cuenta aún no está preparada. Usa "Preparar mi cuenta".';
  return 'No pudimos completar la operación. Inténtalo de nuevo en unos segundos.';
}
