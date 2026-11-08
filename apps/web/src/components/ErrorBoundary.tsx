import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Calm, Spanish recovery screen for uncaught render errors anywhere in the tree. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Kept minimal on purpose: no telemetry wiring is specified by the contract.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-screen" role="alert">
          <h1>Algo no salió como esperábamos</h1>
          <p>
            Ocurrió un problema al mostrar esta pantalla. Tu información no se perdió: puedes
            intentar recargar la página.
          </p>
          <button type="button" onClick={this.handleReload}>
            Recargar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
