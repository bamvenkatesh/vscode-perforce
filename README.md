# Perforce for VSCode

    With perforce extension, you can perform basic perforce operations within VSCode.

## Features

    Basic operations in perforce are supported with this extension.

Choose commands from Command Palette:

![Command Palette](https://github.com/bamvenkatesh/vscode-perforce/raw/master/images/palette.png)
<br/><br/><br/>

Status bar Perforce icon:

![New File](https://github.com/bamvenkatesh/vscode-perforce/raw/master/images/statusbar.png)
<br/><br/><br/>

Choose option from the Perforce Menu:

![New File](https://github.com/bamvenkatesh/vscode-perforce/raw/master/images/menu.png)
<br/><br/><br/>

## Usage

* Click on the perforce menu option aligned to left side of the status bar, you can see the list of available perforce operations. Select the desired option you want to perform on the open file.
* You can perform the same operations by selecting the appropriate command from the command palette.

* You can check the file status on the left side of status bar.
* Information messages concerning the results of the executed perforce commands will be displayed to the left side of status bar.

## Requirements

* A perforce client already installed on your computer.
* You have an account with the perforce depot.
* To set the active changelist for the perforce operations in VSCode, configure perforce integration in settings.

## Extension Settings

Configure below settings for the better usage of this extension

* `perforce.host`: hostname of the client workspace.
* `perforce.client`: name of the current client workspace.
* `perforce.user`: current perforce username. 
* `perforce.path`: configure the path to p4.
* `perforce.activeChangelist`: set the changelist number to act as default for perforce operations in VSCode.
* `perforce.editOnFileSave`: Automatically open the file for edit on save.
* `perforce.addOnFileCreate`: Automatically open the file for add operaiton on create.
* `perforce.deleteOnFileDelete`: Automatically open the file for deletion operation on file delete.


### 1.0.0

Initial release of Perforce Extension.
