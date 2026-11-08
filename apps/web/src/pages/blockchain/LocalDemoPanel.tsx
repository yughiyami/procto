import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardBody, CardHeader, DescriptionList } from '@izumi/ui';
import { readBlockchainDemo } from './demoApi';

export function LocalDemoPanel({ onSelect }: { onSelect: (hash: string) => void }) {
  const query = useQuery({ queryKey: ['blockchain', 'local-demo'], queryFn: readBlockchainDemo, retry: false });
  const data = query.data;
  const deployment = data?.deployment;
  const connected = data?.connected === true && data.chainId === 31337;

  return <Card>
    <CardHeader title="Garantía cripto · DEMO local" actions={<Badge tone={connected ? 'success' : 'warning'}>{connected ? 'Verificada en cadena local' : 'Sin verificar'}</Badge>} />
    <CardBody className="blockchain__form-body">
      <Alert tone="info" title="LOCAL · Chain ID 31337 · Sin dinero real">
        Contrato Minkaly ejecutado en una cadena privada de desarrollo. Los tokens son sintéticos: no son soles,
        no tienen valor y no modifican Caja. Esto no es Sepolia ni Ethereum mainnet.
        El API y esta pantalla no firman; el ejercicio se ejecuta mediante el script local de demostración.
      </Alert>
      {query.isPending ? <p role="status">Comprobando el nodo y los recibos…</p> : null}
      {query.isError ? <Alert tone="warning">No se pudo consultar la demo local. Comprueba que el backend esté actualizado y en ejecución.</Alert> : null}
      {data && !connected ? <Alert tone="warning">La cadena local no está disponible o su despliegue no pudo verificarse. {data.error ?? 'Inicia el nodo y ejecuta el despliegue DEMO.'}</Alert> : null}
      <Button variant="secondary" size="sm" loading={query.isFetching} onClick={() => void query.refetch()}>Actualizar verificación local</Button>
      {connected && deployment ? <>
        <DescriptionList items={[
          { key: 'network', term: 'Red verificada', detail: 'LOCAL 31337 (solo desarrollo)' },
          { key: 'contract', term: 'Contrato Minkaly', detail: <code className="blockchain__mono">{deployment.contractAddress}</code> },
          { key: 'token', term: 'Token sintético', detail: <code className="blockchain__mono">{deployment.tokenAddress}</code> },
          { key: 'time', term: 'Ejercicio generado', detail: new Date(deployment.createdAt).toLocaleString('es-PE') },
        ]} />
        <div className="blockchain__demo-scenarios">
          {deployment.scenarios.map((scenario) => <section key={scenario.orderHash} className="blockchain__demo-scenario">
            <h3>{scenario.label}</h3>
            <p>Estado del contrato: <strong>{['No existe', 'Retenido', 'Liberado', 'Reclamado', 'Liquidado'][scenario.state] ?? scenario.state}</strong></p>
            <p>{scenario.amountBaseUnits} unidades base del token DEMO</p>
            <code className="blockchain__mono">{scenario.orderHash}</code>
            <Button variant="secondary" size="sm" onClick={() => onSelect(scenario.orderHash)}>Consultar este escenario</Button>
          </section>)}
        </div>
        <details className="blockchain__receipts">
          <summary>Ver {deployment.receipts.length} recibos reales de la cadena local</summary>
          <ul>{deployment.receipts.map((receipt) => <li key={receipt.hash}>
            <strong>{receipt.action}</strong> · bloque {receipt.blockNumber} · {receipt.status === 1 ? 'Ejecutada' : 'Fallida'}
            <code className="blockchain__mono">{receipt.hash}</code>
          </li>)}</ul>
          <p>No hay explorador público: estos hashes solo existen en el nodo local. Reiniciarlo puede borrar el ejercicio.</p>
        </details>
      </> : null}
    </CardBody>
  </Card>;
}
