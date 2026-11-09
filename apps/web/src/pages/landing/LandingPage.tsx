import { Link } from 'react-router-dom';
import { ProctoMark } from '@izumi/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { explorerContract } from '../../stellar/config';
import './LandingPage.css';

const STEPS = [
  {
    title: 'La cotización aceptada es la orden de pago',
    body: 'Cuando el comprador acepta, el monto se reparte solo: cada taller y la coordinación ven cuánto les corresponde.',
  },
  {
    title: 'El comprador deposita y el dinero queda en garantía',
    body: 'El pago completo queda guardado. Nadie, ni la coordinadora, puede usarlo hasta que se confirme cada entrega.',
  },
  {
    title: 'Cada taller cobra al entregar',
    body: 'El comprador confirma la entrega y el dinero llega directo a la cuenta del taller, sin intermediarios ni esperas.',
  },
  {
    title: '¿Necesitas el dinero antes? Pide un adelanto',
    body: 'Como el pago ya está depositado, un inversionista puede adelantártelo con un pequeño descuento y tú cobras hoy.',
  },
];

function SplitDiagram() {
  return (
    <figure className="split" aria-label="Una cotización aceptada de S/ 30,000 se reparte entre dos talleres y la coordinación">
      <svg viewBox="0 0 360 330" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="thread" gradientUnits="userSpaceOnUse" x1="0" y1="78" x2="0" y2="190">
            <stop offset="0" stopColor="var(--brand-cochineal)" />
            <stop offset="1" stopColor="var(--brand-gold)" />
          </linearGradient>
        </defs>
        <path className="split__thread" d="M180 78 C180 130 60 120 60 190" pathLength="1" />
        <path className="split__thread" d="M180 78 C180 140 180 150 180 190" pathLength="1" />
        <path className="split__thread" d="M180 78 C180 130 300 120 300 190" pathLength="1" />
      </svg>
      <div className="split__top">
        <span>Cotización aceptada</span>
        <strong>S/ 30,000</strong>
      </div>
      <ul className="split__targets">
        <li>
          <span>Taller de tejido</span>
          <strong>S/ 13,800</strong>
        </li>
        <li>
          <span>Taller de bordado</span>
          <strong>S/ 7,920</strong>
        </li>
        <li>
          <span>Coordinación</span>
          <strong>S/ 8,280</strong>
        </li>
      </ul>
    </figure>
  );
}

export default function LandingPage() {
  useDocumentTitle('Cobro protegido para talleres');
  return (
    <div className="landing">
      <header className="landing__bar">
        <Link to="/" className="landing__brand" aria-label="PROCTO, inicio">
          <ProctoMark size={28} />
          <span>PROCTO</span>
        </Link>
        <Link to="/inicio" className="landing__enter">
          Entrar
        </Link>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <h1>Cada taller cobra cuando entrega.</h1>
          <p className="hero__lead">
            Un pedido grande se reparte entre varios talleres, pero hoy el dinero llega semanas después y son los talleres quienes
            financian a la coordinadora. PROCTO convierte la cotización aceptada en un cobro protegido.
          </p>
          <div className="hero__cta">
            <Link to="/inicio" className="btn btn--solid">
              Probar la demostración
            </Link>
            <a href="#pasos" className="btn btn--line">
              Ver cómo funciona
            </a>
          </div>
        </div>
        <SplitDiagram />
      </section>

      <section className="compare" aria-labelledby="hoy">
        <h2 id="hoy">Lo que cambia para un taller de Arequipa</h2>
        <div className="compare__grid">
          <article className="lane lane--old">
            <h3>Hoy</h3>
            <ol>
              <li>
                <b>Día 0</b> El taller teje y entrega las prendas.
              </li>
              <li>
                <b>Día 30 a 60</b> La tienda de Lima paga a la coordinadora.
              </li>
              <li>
                <b>Después</b> El taller recibe su parte, si el dinero alcanzó.
              </li>
            </ol>
            <p>El taller trabajó, entregó y esperó. Su capital financió el pedido.</p>
          </article>
          <article className="lane lane--new">
            <h3>Con PROCTO</h3>
            <ol>
              <li>
                <b>Día 0</b> El comprador deposita el pago completo en garantía.
              </li>
              <li>
                <b>Entrega</b> El comprador confirma lo recibido.
              </li>
              <li>
                <b>Ese mismo momento</b> Cada taller cobra directo en su cuenta.
              </li>
            </ol>
            <p>Nadie financia a nadie. Y si hace falta efectivo antes, el taller pide un adelanto.</p>
          </article>
        </div>
      </section>

      <section className="steps" id="pasos" aria-labelledby="pasos-t">
        <h2 id="pasos-t">Así funciona, paso a paso</h2>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="steps__n" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="trust" aria-labelledby="confianza">
        <h2 id="confianza">Pensado para quien nunca usó una billetera digital</h2>
        <ul>
          <li>
            <h3>Sin comisiones para ti</h3>
            <p>PROCTO cubre las comisiones de la red. No necesitas comprar nada para empezar.</p>
          </li>
          <li>
            <h3>Tu dinero, tu cuenta</h3>
            <p>Cada taller cobra en su propia billetera. Ni PROCTO ni la coordinadora guardan el dinero de nadie.</p>
          </li>
          <li>
            <h3>Comprobante que cualquiera puede verificar</h3>
            <p>Cada pago deja un registro público. Compártelo con tu banco, tu cliente o tu contador.</p>
          </li>
        </ul>
        <div className="hero__cta">
          <Link to="/inicio" className="btn btn--solid">
            Probar la demostración
          </Link>
        </div>
      </section>

      <footer className="landing__foot">
        <p>
          PROCTO es la evolución de NEXO, la herramienta de pedidos compartidos para talleres. Esta versión funciona en una red de
          pruebas con dinero sin valor real.{' '}
          <a href={explorerContract()} target="_blank" rel="noreferrer">
            Ver el contrato en la red Stellar
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
