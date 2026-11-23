import { browserKV, clearStored, STORAGE_KEYS } from '../core/storage';

export function CrashScreen({ error }: { error: Error }) {
  const reload = () => location.reload();
  const resetAndReload = () => {
    clearStored(browserKV, Object.values(STORAGE_KEYS));
    location.reload();
  };

  return (
    <div role="alert" className="flex min-h-dvh items-center justify-center bg-[#eef2f6] p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <h1 className="text-lg font-semibold text-slate-900">Что-то пошло не так</h1>
        <p className="mt-2 text-[13px] text-slate-600">
          Ваши параметры сохранены в браузере. Попробуйте перезагрузить страницу.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            autoFocus
            onClick={reload}
            className="rounded-lg bg-[#1e63c4] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1a56ab]"
          >
            Перезагрузить
          </button>
          <button
            type="button"
            onClick={resetAndReload}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-800 hover:bg-slate-50"
          >
            Сбросить сохранённые данные
          </button>
        </div>
        <details className="mt-4 text-[12px] text-slate-500">
          <summary className="cursor-pointer select-none">Подробности</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-slate-700">
            {error.message}
          </pre>
        </details>
      </div>
    </div>
  );
}
