import { Button } from '@izumi/ui';
import { ROLES, useSession } from '../session/SessionContext';
import { hintTitle, nextAction } from './nextAction';
import type { PaymentContext } from './nextAction';

/** "Ahora te toca: Depositar pago": tells the active role what to do next, or whose turn it is. */
export function RoleHint({ context }: { context: PaymentContext }) {
  const { role, setRole } = useSession();
  const action = nextAction(role, context);
  const actor = action.actor ? ROLES.find((r) => r.id === action.actor) : undefined;
  return (
    <div className="role-hint" data-mine={action.mine} role="note" data-tour="role-hint">
      <div className="role-hint__text">
        <strong>{hintTitle(role, action)}</strong>
        <span>{action.detail}</span>
      </div>
      {!action.mine && actor && (
        <Button size="sm" variant="secondary" onClick={() => setRole(actor.id)}>
          Ver como {actor.label}
        </Button>
      )}
    </div>
  );
}
