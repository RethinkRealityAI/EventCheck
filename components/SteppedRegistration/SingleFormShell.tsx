import { FormRenderer, type FormRendererProps } from './FormRenderer';

export function SingleFormShell(props: Omit<FormRendererProps, 'filteredFields'>) {
  return <FormRenderer {...props} filteredFields={props.form.fields} />;
}
