// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
let vscode = require('vscode');
let child_process = require('child_process');
let path = require('path');
let tmp = require('tmp');
let spawn = child_process.spawn;
let exec = child_process.exec;

let _statusBarItem;

function check_login_status(){
    let promise = new Promise((resolve, reject) => {
        let child = spawn('p4',['login','-s']);
        child.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            resolve(true);
        });

        child.stderr.on('data', (data) => {
            reject(data);
        });
    });
    return promise;
}

function login(silent){
    return new Promise( (resolve, reject) => {
        check_login_status()
        .then( resp => {
            // user has already logged into perforce.
            resolve('Login Successful');
            vscode.window.setStatusBarMessage('Perforce: Login Successful', 3000);
            updateStatusBar();
        })
        .catch( reason => {
            // not logged in. So catch the error and login to perforce
            
            let child = spawn('p4',['login']);
            child.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);

                let resp = data.toString().trim();
                if(resp.indexOf('password') !== -1){
                    vscode.window.showInputBox({
                        'prompt':'Please enter the password'
                    }).then(pswd => {
                        if(pswd)
                            child.stdin.write(pswd + '\n');
                    });
                }else if( resp.indexOf('logged in') !== -1 && !silent){
                    resolve('Perforce: Login Successful');
                    vscode.window.setStatusBarMessage('Perforce: Login Successful', 3000);
                    updateStatusBar();
                }
            });

            child.stderr.on('data', (data) => {
                console.log(`stderr: ${data}`);
                vscode.window.setStatusBarMessage('Perforce: Login Failure. Please try again', 3000);
                updateStatusBar();
            });
        });
    });
}

function logout(){
    exec('p4 logout', (err, stdout, stderr) => {
        if(!err && !stderr){
            vscode.window.setStatusBarMessage('Perforce: Logout Successful', 3000);
            updateStatusBar();
        }
        else
            vscode.window.setStatusBarMessage('Perforce: Failed to Logout', 3000);
    });
}

function getChangelists(){
    return new Promise( (resolve, reject) => {
        let config = vscode.workspace.getConfiguration('perforce');
        let user = config.get('user','none');
        let client = config.get('client','none');
        if( user === 'none' || client === 'none'){
            reject('Please configure perforce connection in the settings');
            return;
        }

        exec('p4 changes -s pending -u ' + user + ' -c ' + client, (err, stdout, stderr) => {
            if(err || stderr){
                reject( stderr || err);
                console.log(stderr || err);
                return;
            }

            let changes = [];
            let changelists = stdout.split('\n');
            changelists.forEach(change => {
                let changelistMatch = /Change\s*(\d*)\s*on.*\*pending\*\s*(.*)/.exec(change);
                if(changelistMatch)
                    changes.push({label:'CL#' + changelistMatch[1] + ' - ' + changelistMatch[2], value:changelistMatch[1]});
            });

            // Adding the default CL to the list
            changes.push({label:'Default', value:'default'});
            resolve(changes);
        });
    });
}

function setactivechangelist(){
    getChangelists()
        .then( changelists => {
            changelists.push({label:'none', value:'none'})
            vscode.window.showQuickPick(changelists).then( changelist => {
                let config = vscode.workspace.getConfiguration('perforce');
                config.update('activeChangelist', changelist.value);
                vscode.window.setStatusBarMessage('Perforce: Active changelist changed to - ' + changelist.value, 3000);
            });
        })
        .catch(reason => {
            reason = reason.replace('\n',' ');
            vscode.window.setStatusBarMessage(reason, 3000);
        });
}

function getActiveChangelist(selectIfNotSet){

    let config = vscode.workspace.getConfiguration('perforce');
    let activecl = config.get('activeChangelist');
    if(activecl && activecl !== 'none')
        return Promise.resolve(activecl);

    if(!selectIfNotSet)
        return Promise.reject();


    let showChangelistsMenu = (changelists) => {
        let p = new Promise((resolve, reject) => {
                        vscode.window.showQuickPick(changelists)
                                            .then( changelist => {
                                                if(changelist)
                                                    resolve(changelist.value);
                                                else
                                                    reject('No Changelist selected');
                                            });
                    });
        return p;
    };

    // show the changelists to select
    return getChangelists()
                .then( 
                    changelists => {
                        return showChangelistsMenu(changelists);
                    },
                    reason => {
                        return showChangelistsMenu([{'value':'default', 'label':'default'}])
                    }
                );
}

function editfile(){
    let fileName = getActiveFile();
    if(!fileName)
        return;

    if(!isFolderOpen())
        return;
        
    getActiveChangelist(true)
        .then( activecl => {
            exec('p4 edit -t +k -c ' + activecl + ' ' + fileName, (err, stdout, stderr) => {
                if(stderr || err)
                    console.log(stderr || err);
                else{
                    vscode.window.setStatusBarMessage('Perforce: File Opened', 3000);
                    updateStatusBar();
                }
            });
        })
        .catch(reason => {
            console.log(reason);
        });

}

function deletefile(event){
    let fileName;
    if(event && event._scheme === 'file' && event._fsPath)
        fileName = event._fsPath;
    else
        fileName = getActiveFile();

    if(!fileName)
        return;

    if(!isFolderOpen())
        return;

    checkIfFileExistsInDepot(fileName)
        .then( (exists) => {
            if(!exists) 
                return;

            getActiveChangelist(true)
                .then( activecl => {
                    exec('p4 delete -c ' + activecl + ' ' + fileName, (err, stdout, stderr) => {
                        if(stderr || err)
                            console.log(stderr || err);
                        else{
                            vscode.window.setStatusBarMessage('Perforce: File Deleted', 3000);
                            updateStatusBar();
                        }
                    });
                })
                .catch(reason => {
                    console.log(reason);
                });
        });
}

function revertchanges(){
    let fileName = getActiveFile();
    if(!fileName)
        return;

    if(!isFolderOpen())
        return;

    exec('p4 revert ' + fileName, (err, stdout, stderr) => {
        if(stderr || err)
            console.log(stderr || err);
        else{
            vscode.window.setStatusBarMessage('Perforce: Changes Reverted', 3000);
            updateStatusBar();
        }
    });
}

function addFile(event){
    let fileName;
    if(event && event._scheme === 'file' && event._fsPath)
        fileName = event._fsPath;
    else
        fileName = getActiveFile();

    if(!fileName)
        return;

    if(!isFolderOpen())
        return;

    checkIfFileExistsInDepot(fileName)
        .then( (exists) => {
            if(exists)
                return;
            
            getActiveChangelist(true)
                .then( activecl => {
                    exec('p4 add -t +k -c ' + activecl + ' ' + fileName, (err, stdout, stderr) => {
                        if(stderr || err)
                            console.log(stderr || err);
                        else{
                            vscode.window.setStatusBarMessage('Perforce: File Added', 3000);
                            updateStatusBar();
                        }
                    });
                })
                .catch(reason => {
                    console.log(reason);
                });
        });
}

function renameFile(move){
    let fileName = getActiveFile();
    if(!fileName)
        return;
    
    if(!isFolderOpen())
        return;

    vscode.window.showInputBox({
        'value': move ? fileName : path.basename(fileName),
        'prompt':'Enter new fileName'
    }).then( newName => {

        let newFilePath;
        if(move){
            if(newName === fileName)
                return;
            newFilePath = newName;
        }else{
            if(newName === path.basename(fileName))
                return;
            newFilePath = path.resolve(path.dirname(fileName), newName);
        }

        getActiveChangelist(true)
            .then( activecl => {

                let moveFile = () => {
                    exec('p4 move -t +k -c ' + activecl + ' ' + fileName + ' ' + newFilePath, (err, stdout, stderr) => {
                        if(stderr || err)
                            return;

                        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('file://' + newFilePath)).then(() => {
                            console.log('Document opened');
                            vscode.window.setStatusBarMessage('Perforce : File Renamed', 3000);
                            updateStatusBar();
                        });
                    });
                };

                exec('p4 add -t +k -c ' + activecl + ' ' + fileName, (err, stdout, stderr) => {
                    exec('p4 edit -t +k -c ' + activecl + ' ' + fileName, (err, stdout, stderr) => {
                        if(stderr || err)
                            console.log(stderr || err);
                        else
                            moveFile();
                    });
                });
            
            })
            .catch(reason => {
                console.log(reason);
            });
    })
}

function diff(revision){

    let fileName = getActiveFile();
    if(!fileName)
        return;
    
    if(!isFolderOpen())
        return;

    tmp.tmpName({postfix:path.extname(fileName)}, (err, tpath) => {
        if(err)
            return;

        revision = revision ? '#' + revision : '';
        
        exec('p4 print -q -o "' + tpath + '" "' + fileName + revision + '"', (err, stdout, stderr) => {
            if(err || stderr)
                return;

            let revisionInfo = revision || ' (Latest Revision)';
            let editor = vscode.window.activeTextEditor;
            vscode.commands.executeCommand("vscode.diff", vscode.Uri.file(tpath), editor.document.uri, path.basename(fileName) + revisionInfo + " and " + path.basename(fileName) + ' (workspace)');
        });
    })
}

function diffRevision(){
    let fileName = getActiveFile();
    if(!fileName)
        return;
    
    if(!isFolderOpen())
        return;

    exec('p4 filelog -s ' + fileName, (err, stdout, stderr) => {
        if(err || stderr)
            return;

        let revisions = stdout.split('\n'), revisionsData = [];
        revisions.shift();  // remove the first line - filename
        revisions.forEach(revisionInfo => {
            if(revisionInfo.indexOf('... #') === -1)
                return;

            let splits = revisionInfo.split(' ');
            let rev = splits[1].substring(1);    // splice 1st character '#'
            let change =  splits[3];
            let changedesc = revisionInfo.substring( revisionInfo.indexOf(splits[9]) + splits[9].length + 1 );
            let label = '#' + rev + '  change: ' + change + '  Desc: ' + changedesc;
            revisionsData.push({rev:rev, change:change, changedesc: changedesc, label:label})
        });

        vscode.window.showQuickPick(revisionsData).then( revision => {
            diff(revision.rev);
        });
    });
}

function getClientRoot(){
    return new Promise( (resolve, reject) => {
        exec('p4 info', (err, stdout, stderr) => {
            if(stderr || err){
                reject(stderr || err);
                return;
            }
            
            let clientRootIndex = stdout.indexOf('Client root:') + ('Client root:').length;
            let clientRootEndIndex = stdout.indexOf('\n', clientRootIndex);
            resolve(stdout.substring(clientRootIndex, clientRootEndIndex).trim());
        });
    });
}

function getActiveFile(){
    let editor = vscode.window.activeTextEditor;
    if(!editor)
        return;

    return editor.document.fileName;
}

function isFileUnderClientRoot(filepath){
    return getClientRoot()
                .then( clientroot => {
                    if(filepath.indexOf(clientroot) !== -1)
                        return true;
                    
                    return false;
                })
                .catch( reason => {
                    return false;
                });
}

function isFolderOpen(){
    let root = vscode.workspace.rootPath;
    if(!root)
        return false;

    return true;
}

function checkIfFileExistsInDepot(fileName){
    return new Promise( (resolve, reject) => {
        exec('p4 files -e ' + fileName, (err, stdout, stderr) => {
            if(stderr)
                resolve(false);
            else if(err)
                reject(err);
            else
                resolve(true);
        });
    });
}

function getActiveEditorP4Status(){
    let editor = vscode.window.activeTextEditor;
    if(!editor)
        return Promise.reject('No Active Editor');

    let document = editor.document;
    if(!document.isUntitled){
        return new Promise( (resolve, reject) => {
            exec('p4 opened "' + document.fileName + '"', (err, stdout, stderr) => {
                if(err){
                    console.log(`File not in client's root`);
                    resolve({code:1, text: err});
                }
                else if(stderr){
                    console.log(`File not opened for edit`);
                    resolve({code:2, text: stderr});
                }
                else{
                    console.log(`File opened for edit`);
                    resolve({code:3, text: stdout});
                }
            });
        });
    }
    else
        Promise.reject('Active text document is untitled document.');
}

function updateStatusBar(){
    if(!_statusBarItem){
        _statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        _statusBarItem.command = 'perforce.showMenu';
    }

    if(!getActiveFile()){
        _statusBarItem.hide();
        return;
    }

    check_login_status()
        .then( () => {
            getActiveEditorP4Status()
                .then( response => {
                    if(response.code === 1){
                        _statusBarItem.text = 'Perforce: $(circle-slash)';
                        _statusBarItem.tooltip = response.text;
                    }else if(response.code === 2){
                        _statusBarItem.text = 'Perforce: $(file-text)';
                        _statusBarItem.tooltip = response.text;
                    }else if(response.code === 3){
                        _statusBarItem.text = 'Perforce: $(check)';
                        _statusBarItem.tooltip = response.text;
                    }

                    _statusBarItem.show();
                })
                .catch( reason => {
                    _statusBarItem.hide();
                });
        })
        .catch( () => {
            _statusBarItem.text = 'Perforce: $(alert)';
            _statusBarItem.tooltip = 'Please login to Perforce to continue working with VSCode Perforce extension.';
            _statusBarItem.show();
        })
}

function checkLoginStatusNExecCommand(command, info){

    check_login_status()
        .then( () => {
            switch(command){
                case 'edit':
                    editfile();
                    break;
                case 'add':
                    addFile(info);
                    break;
                case 'delete':
                    deletefile(info);
                    break;
                case 'rename':
                    renameFile();
                    break;
                case 'move':
                    renameFile(true);
                    break;
                case 'revert':
                    revertchanges();
                    break;
                case 'diff':
                    diff();
                    break;
                case 'diffRevision':
                    diffRevision();
                    break;
                case 'logout':
                    logout();
                    break;
                case 'setActiveChangelist':
                    setactivechangelist();
                    break;
                }
        })
        .catch( () => {
            if(command === 'login')
                return login();

            vscode.window.setStatusBarMessage(`Perforce: Please login.`, 3000);
        });
}

function showMenu(){
    let list = [];
    list.push({'label':'edit', 'description':'Opens file(s) in a client workspace for edit.'})
    list.push({'label':'add', 'description':'Open file(s) in a client workspace for addition to the depot.'})
    list.push({'label':'delete', 'description':'Open file(s) in a client workspace for deletion from the depot.'})
    list.push({'label':'rename', 'description':'Renaming files in a client workspace.'})
    list.push({'label':'move', 'description':'Move a file from one location to another.'})
    list.push({'label':'revert', 'description':'Discard changes made to open files.'})
    list.push({'label':'diff', 'description':'Compare a client workspace file to the revision currently being edited'})
    list.push({'label':'diffRevision', 'description':'Compare a client workspace file to a revision in the depot.'})
    list.push({'label':'login', 'description':'Log in to the Perforce service by obtaining a ticket.'})
    list.push({'label':'logout', 'description':'Log out of Perforce.'})
    list.push({'label':'setActiveChangelist', 'description':'Set the active changelist to work on.'})

    vscode.window.showQuickPick(list)
        .then( option => {
            if(!option)
                return;

             checkLoginStatusNExecCommand(option.label);
        });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {

    console.log('Perforce file watcher is now active');

    let root = vscode.workspace.rootPath;

    let disposable = vscode.commands.registerCommand('perforce.login',checkLoginStatusNExecCommand.bind(this, 'login'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.logout', checkLoginStatusNExecCommand.bind(this, 'logout'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.setactivechangelist', checkLoginStatusNExecCommand.bind(this, 'setActiveChangelist'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.edit', checkLoginStatusNExecCommand.bind(this, 'edit'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.add', checkLoginStatusNExecCommand.bind(this, 'add'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.delete', checkLoginStatusNExecCommand.bind(this, 'delete'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.rename', checkLoginStatusNExecCommand.bind(this, 'rename'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.move', checkLoginStatusNExecCommand.bind(this, 'move'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.revert', checkLoginStatusNExecCommand.bind(this, 'revert'));
    context.subscriptions.push(disposable);
    
    disposable = vscode.commands.registerCommand('perforce.diff', checkLoginStatusNExecCommand.bind(this, 'diff'));
    context.subscriptions.push(disposable);
    
    disposable = vscode.commands.registerCommand('perforce.diffRevision', checkLoginStatusNExecCommand.bind(this, 'diffRevision'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('perforce.showMenu', showMenu);
    context.subscriptions.push(disposable);

    updateStatusBar();
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar);

    isFileUnderClientRoot(root)
        .then( (resp) => {
            if(!resp)
                return;

            // TODO: register as per config settings
            vscode.workspace.onWillSaveTextDocument( (event) => {
                if(!event.document)
                    return;
                
                let fileName = event.document.fileName;
                if(vscode.workspace.asRelativePath(fileName) === fileName)
                    return;

                let config = vscode.workspace.getConfiguration('perforce');
                if(config.get('editOnFileSave')){
                    getActiveEditorP4Status()
                        .then( response => {
                            if(response.code === 2)
                                checkLoginStatusNExecCommand('edit');
                        })
                }
            });

            let fileWatcher = vscode.workspace.createFileSystemWatcher( root + '/**/*.*', false, true, false);
            fileWatcher.onDidDelete((event) => {
                let config = vscode.workspace.getConfiguration('perforce');
                if(config.get('deleteOnFileDelete'))
                    checkLoginStatusNExecCommand('delete', event);
            });
            fileWatcher.onDidCreate((event) => {
                let config = vscode.workspace.getConfiguration('perforce');
                if(config.get('addOnFileCreate'))
                    checkLoginStatusNExecCommand('add', event);
            });
        });
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;