import { TextPreview } from '../text-preview.js';
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
	className,
	disabled,
	...props
}: React.ComponentProps<"textarea">) {
		if (props.readOnly) return <TextPreview text={String(props.value ?? props.defaultValue ?? '')} className={className} aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} aria-invalid={props['aria-invalid']} aria-required={props['aria-required']}/>;
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"placeholder:text-muted-foreground hover:border-ring/70 focus-visible:border-ring focus-visible:ring-ring aria-invalid:ring-destructive/50 aria-invalid:border-destructive bg-input flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base shadow-xs transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background data-disabled:pointer-events-none data-disabled:opacity-50 md:text-sm",
				className
			)}
			data-disabled={disabled ? "" : undefined}
			disabled={disabled}
			{...props}
		/>
	)
}

export { Textarea }
