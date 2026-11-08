import { Alert, Card, CardBody, CardHeader } from '@izumi/ui';
import { formatPen } from '@izumi/contracts';
import type { Feasibility, Order } from '@izumi/contracts';
import { translateFeasibilityReason } from './feasibilityReasons';
import { useSupplierNameResolver, useSuppliers } from './useSupplierOptions';

interface Props {
  order: Order;
  feasibility: Feasibility;
}

/**
 * THE CENTREPIECE: makes the blocking reason obvious at a glance. A feasible order says
 * "listo para cotizar" calmly; an infeasible one says exactly which commitments are the
 * problem, in Spanish, resolved to supplier names instead of raw ids.
 */
export function FeasibilityPanel({ order, feasibility }: Props) {
  const suppliersQuery = useSuppliers();
  const resolveSupplierName = useSupplierNameResolver(suppliersQuery.data);

  const coveragePct =
    order.quantity > 0 ? Math.min(100, Math.round((feasibility.totalQuantity / order.quantity) * 100)) : 0;
  const shortfall = Math.max(order.quantity - feasibility.totalQuantity, 0);

  return (
    <Card className="order-detail__feasibility">
      <CardHeader title="Viabilidad" />
      <CardBody>
        {feasibility.feasible ? (
          <Alert tone="success" title="Listo para cotizar">
            Los aportes registrados cubren por completo lo solicitado y cumplen la especificación.
          </Alert>
        ) : (
          <Alert tone="warning" title="Todavía no podemos prometer esta fecha">
            <ul className="order-detail__reason-list">
              {feasibility.reasons.map((reason) => (
                <li key={reason}>{translateFeasibilityReason(reason, resolveSupplierName)}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="order-detail__coverage">
          <div
            className="order-detail__coverage-bar"
            role="img"
            aria-label={`Cobertura: ${feasibility.totalQuantity} de ${order.quantity} unidades asignadas`}
          >
            <span className="order-detail__coverage-fill" style={{ width: `${coveragePct}%` }} />
          </div>
          <p className="order-detail__coverage-caption">
            {feasibility.totalQuantity} / {order.quantity} unidades asignadas
            {shortfall > 0 ? ` — faltan ${shortfall}` : ''}
          </p>
        </div>

        <dl className="order-detail__feasibility-totals">
          <div>
            <dt>Costo total estimado</dt>
            <dd>{formatPen(feasibility.costCents)}</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}
