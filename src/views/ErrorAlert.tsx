import React from 'react';
import { Icon } from 'vortex-api';

interface IErrorProps {
    title: string;
    detail: string;
}

export default function ErrorAlert({ title, detail }: IErrorProps) {
    return (
        <div className="nxm-banner-warning">
            <h2><Icon name='warning' /> {title}</h2>
            <p>{detail}</p>
        </div>
    )
}