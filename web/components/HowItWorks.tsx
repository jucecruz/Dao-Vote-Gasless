"use client";

import { useWallet } from "@/context/WalletContext";
import { useDao } from "@/context/DaoContext";
import { formatEth, formatDuration } from "@/lib/format";
import { ChevronDownIcon } from "./icons";

const STEPS = [
  {
    title: "Deposita ETH",
    body: 'Usa "Financiación de las Propuestas" para depositar ETH en el DAO. Tu saldo depositado es histórico (no baja al ejecutarse una propuesta) y determina tu poder de voto y si puedes crear propuestas.',
  },
  {
    title: "Crea una propuesta",
    body: "Solo si tu saldo depositado es al menos el 10% del total disponible del DAO. Indica beneficiario, monto, fecha límite y una descripción de para qué son los fondos.",
  },
  {
    title: "Vota sin pagar gas",
    body: 'Mientras la propuesta esté "Activa", vota A favor, En contra o Abstención. Firmas con tu wallet, pero un relayer paga el gas por ti. Puedes cambiar tu voto las veces que quieras antes del deadline.',
  },
  {
    title: "Espera (o ejecuta) el resultado",
    body: 'Si al cerrar la votación hay más votos "A favor" que "En contra", la propuesta queda "Aprobada". Tras un período de seguridad adicional, el daemon la ejecuta sola — o puedes ejecutarla tú desde "Ejecución de propuestas".',
  },
];

export function HowItWorks() {
  const { address } = useWallet();
  const { minVoteBalance, executionDelay } = useDao();

  const hasLiveValues = !!address && minVoteBalance > 0n && executionDelay > 0n;

  return (
    <details className="group rounded-2xl border border-teal-100 bg-teal-50/60 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4">
        <h2 className="text-sm font-semibold text-slate-900">¿Cómo funciona este DAO?</h2>
        <ChevronDownIcon className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-teal-100 p-6 pt-4">
        <p className="mb-4 text-sm text-slate-600">Sigue estos 4 pasos para participar:</p>

        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-slate-900">{step.title}</p>
                <p className="mt-1 text-sm text-slate-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-900">Restricciones importantes</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>
              Para votar necesitas al menos{" "}
              <strong>{hasLiveValues ? formatEth(minVoteBalance) : "el mínimo definido por el DAO"}</strong>{" "}
              depositados.
            </li>
            <li>
              Para crear una propuesta necesitas al menos el <strong>10%</strong> del total disponible en el DAO.
            </li>
            <li>Solo puedes votar mientras la propuesta esté &quot;Activa&quot; (antes de su deadline).</li>
            <li>
              Una propuesta se aprueba si los votos &quot;A favor&quot; superan a los &quot;En contra&quot;; las
              abstenciones no cuentan para ningún lado.
            </li>
            <li>
              Tras el deadline debe pasar además un período de seguridad de{" "}
              <strong>{hasLiveValues ? formatDuration(executionDelay) : "seguridad definido por el DAO"}</strong>{" "}
              antes de poder ejecutarla.
            </li>
          </ul>
        </div>
      </div>
    </details>
  );
}
