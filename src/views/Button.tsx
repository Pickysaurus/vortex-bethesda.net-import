import React, { ButtonHTMLAttributes, DetailedHTMLProps } from "react";

interface IButtonProps {
    
}

export default function Button({ className, children, ...props }: DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>) {
    const baseClassName = 'btn btn-default'
    const classNameCombined = className ? `${className} ${baseClassName}` : baseClassName;

    return (
        <button className={classNameCombined} {...props}>
            {children}
        </button>
    )
}