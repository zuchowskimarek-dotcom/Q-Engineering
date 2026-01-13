import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    Button,
} from '@chakra-ui/react';
import { useRef } from 'react';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    isLoading?: boolean;
}

export const ConfirmDialog = ({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed? This action cannot be undone.',
    confirmText = 'Delete',
    cancelText = 'Cancel',
    isLoading = false
}: ConfirmDialogProps) => {
    const cancelRef = useRef<HTMLButtonElement>(null);

    return (
        <AlertDialog
            isOpen={isOpen}
            leastDestructiveRef={cancelRef}
            onClose={onClose}
            isCentered
        >
            <AlertDialogOverlay bg="blackAlpha.700" backdropFilter="blur(5px)" />
            <AlertDialogContent bg="gray.800" color="white" borderColor="whiteAlpha.200" border="1px">
                <AlertDialogHeader fontSize="lg" fontWeight="bold">
                    {title}
                </AlertDialogHeader>

                <AlertDialogBody color="gray.300">
                    {message}
                </AlertDialogBody>

                <AlertDialogFooter borderTop="1px" borderColor="whiteAlpha.100" mt={4}>
                    <Button ref={cancelRef} onClick={onClose} variant="ghost" isDisabled={isLoading}>
                        {cancelText}
                    </Button>
                    <Button colorScheme="red" onClick={onConfirm} ml={3} isLoading={isLoading}>
                        {confirmText}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
