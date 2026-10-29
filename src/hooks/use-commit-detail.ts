import { useCallback, useEffect, useRef, useState } from "react";

import { getCommitFileDiff, getCommitDetail, toGitError } from "@/lib/git-api";
import type {
  CommitDetail,
  CommitFileChange,
  FileDiff,
  GitError,
} from "@/types/git";

export interface CommitDetailController {
  detail: CommitDetail | null;
  isLoading: boolean;
  error: GitError | null;
  selectedFile: CommitFileChange | null;
  fileDiff: FileDiff | null;
  isFileLoading: boolean;
  fileError: GitError | null;
  selectFile: (file: CommitFileChange) => void;
  retry: () => void;
}

export function useCommitDetail(
  repoPath: string,
  oid: string | null,
): CommitDetailController {
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GitError | null>(null);
  const [selectedFile, setSelectedFile] = useState<CommitFileChange | null>(
    null,
  );
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [fileError, setFileError] = useState<GitError | null>(null);
  const [detailToken, setDetailToken] = useState(0);
  const [fileToken, setFileToken] = useState(0);
  const detailSequence = useRef(0);
  const fileSequence = useRef(0);

  useEffect(() => {
    const requestId = ++detailSequence.current;
    setSelectedFile(null);
    setFileDiff(null);
    setFileError(null);

    if (!oid) {
      setDetail(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    void getCommitDetail(repoPath, oid)
      .then((next) => {
        if (requestId === detailSequence.current) {
          setDetail(next);
          const first = next.files[0] ?? null;
          setSelectedFile(first);
        }
      })
      .catch((rawError: unknown) => {
        if (requestId === detailSequence.current) {
          setError(toGitError(rawError));
        }
      })
      .finally(() => {
        if (requestId === detailSequence.current) {
          setIsLoading(false);
        }
      });
  }, [detailToken, oid, repoPath]);

  useEffect(() => {
    const requestId = ++fileSequence.current;
    if (!oid || !selectedFile) {
      setFileDiff(null);
      setFileError(null);
      setIsFileLoading(false);
      return;
    }

    setIsFileLoading(true);
    setFileError(null);
    setFileDiff(null);
    void getCommitFileDiff(
      repoPath,
      oid,
      selectedFile.path,
      selectedFile.originalPath,
    )
      .then((next) => {
        if (requestId === fileSequence.current) {
          setFileDiff(next);
        }
      })
      .catch((rawError: unknown) => {
        if (requestId === fileSequence.current) {
          setFileError(toGitError(rawError));
        }
      })
      .finally(() => {
        if (requestId === fileSequence.current) {
          setIsFileLoading(false);
        }
      });
  }, [fileToken, oid, repoPath, selectedFile]);

  useEffect(
    () => () => {
      detailSequence.current += 1;
      fileSequence.current += 1;
    },
    [],
  );

  const selectFile = useCallback((file: CommitFileChange) => {
    setSelectedFile(file);
  }, []);
  const retry = useCallback(() => {
    setDetailToken((token) => token + 1);
    setFileToken((token) => token + 1);
  }, []);

  return {
    detail,
    isLoading,
    error,
    selectedFile,
    fileDiff,
    isFileLoading,
    fileError,
    selectFile,
    retry,
  };
}
