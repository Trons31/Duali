"use client";

import { SelectField } from "@/components/ui/select-field";

/** Lo que el horario necesita de un instructor activo (spec 023 D5). */
export type InstructorOption = { id: string; nombre: string; disciplinaIds: string[] };

/**
 * Spec 023 R4: lista de instructores con los que dan la disciplina primero.
 * `emptyLabel` es la primera opcion (valor ""): "Sin asignar" o "El titular".
 */
export function InstructorSelect({
  id,
  value,
  onChange,
  instructors,
  disciplineId,
  emptyLabel,
  extraOption,
  disabled
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  instructors: InstructorOption[];
  disciplineId: string;
  emptyLabel: string;
  /** Un valor que ya no esta en la lista (un nombre escrito a mano, alguien inactivo). */
  extraOption?: { value: string; label: string } | null;
  disabled?: boolean;
}) {
  const teaches = instructors.filter((item) => item.disciplinaIds.includes(disciplineId));
  const others = instructors.filter((item) => !item.disciplinaIds.includes(disciplineId));

  return (
    <SelectField id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{emptyLabel}</option>
      {extraOption ? <option value={extraOption.value}>{extraOption.label}</option> : null}
      {teaches.length && others.length ? (
        <>
          <optgroup label="Dan esta disciplina">
            {teaches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </optgroup>
          <optgroup label="Otros instructores">
            {others.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </optgroup>
        </>
      ) : (
        [...teaches, ...others].map((item) => (
          <option key={item.id} value={item.id}>
            {item.nombre}
          </option>
        ))
      )}
    </SelectField>
  );
}
