import { PageHeader } from '@izumi/ui';
import { AccountPanel } from '../../components/AccountPanel';
import { ResetDemoButton } from '../../components/ResetDemoButton';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function AccountPage() {
  useDocumentTitle('Mi billetera');
  return (
    <div className="stack-page">
      <PageHeader title="Mi billetera" subtitle="Aquí ves tu saldo y preparas tu cuenta para cobrar o pagar." />
      <AccountPanel />
      <p className="account-demo">
        Demostración: <ResetDemoButton /> vuelve a armar el pedido de ejemplo desde cero.
      </p>
    </div>
  );
}
