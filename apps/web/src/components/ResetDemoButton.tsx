import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@izumi/ui';
import { store } from '../lib/apiClient';

/**
 * Discreet "Reiniciar demo": rebuilds the sample order from scratch and runs /demo again.
 * The quick wallets (and their demo money) are kept, so the second run is fast.
 */
export function ResetDemoButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function reset() {
    await store.init();
    await store.reset();
    queryClient.clear();
    setOpen(false);
    navigate('/demo');
  }

  return (
    <>
      <button type="button" className={className ?? 'linkish'} onClick={() => setOpen(true)}>
        Reiniciar demo
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="¿Reiniciar la demo?"
        description="Se borran los pedidos de prueba de este navegador y se arma el pedido de cero. Tus cuentas de prueba y su saldo se conservan."
        confirmLabel="Reiniciar demo"
        cancelLabel="Cancelar"
        onConfirm={reset}
      />
    </>
  );
}
