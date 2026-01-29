import { Spinner } from "vortex-api";

export default function BethesdaImportStepWait() {
    return (
        <div className='bethesda-wait-container'>
            <Spinner className='page-wait-spinner' />
        </div>
    )
}