; LeonGit 安装器钩子
; Tauri 会在 installer.nsi 中 include 本文件，并插入以下三个宏。

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "正在关闭已运行的 LeonGit..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM "${MAINBINARYNAME}.exe" /T'
  Pop $0
  Sleep 800
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 静默安装与被动模式：安装完成后直接启动新版本。
  ; 若调用方已显式传入 /R，则交给 Tauri 内置逻辑启动，避免启动两次。
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
    ${GetOptions} $CMDLINE "/R" $R0
    ${If} ${Errors}
      DetailPrint "正在启动 LeonGit..."
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "正在关闭 LeonGit..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM "${MAINBINARYNAME}.exe" /T'
  Pop $0
  Sleep 800

  ; 更新模式、静默/被动卸载都不询问，一律保留用户数据。
  ${If} $UpdateMode = 1
    DetailPrint "更新模式：保留 Data 与 WebView2Data。"
  ${ElseIf} ${Silent}
    DetailPrint "静默卸载：保留 Data 与 WebView2Data。"
  ${ElseIf} $PassiveMode = 1
    DetailPrint "被动卸载：保留 Data 与 WebView2Data。"
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "是否同时删除 LeonGit 的配置、缓存和 WebView2 数据？$\r$\n$\r$\n默认保留这些数据；选择“是”才会删除，重新安装后可继续使用。" IDNO leon_git_keep_data
    RMDir /r "$INSTDIR\Data"
    RMDir /r "$INSTDIR\WebView2Data"
    leon_git_keep_data:
  ${EndIf}
!macroend
